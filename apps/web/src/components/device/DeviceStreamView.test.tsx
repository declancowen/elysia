import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/reactivity";
import { act } from "../../../test/act";
import { useEffect, useSyncExternalStore } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId } from "@elysiatools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

// Like the real atom, a refresh yields a new access object and re-renders subscribers.
const accessStore = {
  value: { httpBase: "http://test", wsBase: "ws://test", query: {}, credentials: true },
  listeners: new Set<() => void>(),
  refresh() {
    accessStore.value = { ...accessStore.value };
    for (const listener of accessStore.listeners) listener();
  },
  subscribe(listener: () => void) {
    accessStore.listeners.add(listener);
    return () => accessStore.listeners.delete(listener);
  },
};
vi.mock("~/state/device", () => ({
  useDeviceHubAccess: () => useSyncExternalStore(accessStore.subscribe, () => accessStore.value),
  refreshDeviceHubAccess: () => accessStore.refresh(),
}));
// Replace GPU allocation while keeping the real React and stream lifecycles.
let viewerMounts = 0;
let viewerUnmounts = 0;
vi.mock("./DevicePhoneViewport", () => ({
  DevicePhoneViewport: function Viewer() {
    useEffect(() => {
      viewerMounts++;
      return () => {
        viewerUnmounts++;
      };
    }, []);
    return null;
  },
}));
import { DeviceStreamView } from "./DeviceStreamView";

class Image extends EventTarget {
  src = "";
  naturalWidth = 0;
  naturalHeight = 0;
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}
let renderer: ReactTestRenderer | undefined;
let registry: AtomRegistry.AtomRegistry;
let primes = 0;
beforeEach(() => {
  registry = AtomRegistry.make({
    scheduleTask(callback) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) callback();
      });
      return () => {
        cancelled = true;
      };
    },
  });
  primes = 0;
  viewerMounts = 0;
  viewerUnmounts = 0;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  await act(async () => vi.advanceTimersByTimeAsync(0));
  registry.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup(h264 = false) {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", {
    createElement: (type: string) => {
      expect(type).toBe("canvas");
      return { style: {}, getContext: () => ({ drawImage() {} }), remove() {} };
    },
  });
  let videoBody: ReadableStreamDefaultController<Uint8Array> | undefined;
  let output: VideoFrameOutputCallback | undefined;
  if (h264) {
    vi.stubGlobal(
      "VideoDecoder",
      class {
        static isConfigSupported = async () => ({ supported: true });
        state = "unconfigured";
        constructor(callbacks: VideoDecoderInit) {
          output = callbacks.output;
        }
        configure() {
          this.state = "configured";
        }
        close() {
          this.state = "closed";
        }
      },
    );
    vi.stubGlobal("EncodedVideoChunk", vi.fn());
  }
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    if (url.endsWith("stream.avcc")) {
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              videoBody = controller;
              init.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
            },
          }),
        ),
      );
    }
    primes++;
    return Promise.resolve(new Response("prime"));
  });
  const sockets: Array<{ onmessage?: (event: { data: ArrayBuffer }) => void }> = [];
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      readyState = 1;
      constructor() {
        sockets.push(this);
      }
      onmessage?: (event: { data: ArrayBuffer }) => void;
      send() {}
      close() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const images = [new Image()];
  const view = (visible: boolean) => (
    <RegistryContext.Provider value={registry}>
      <DeviceStreamView
        hostId="local"
        environmentId={EnvironmentId.make("test")}
        deviceId="test"
        platform="ios"
        visible={visible}
        allowPhoneView={h264}
      />
    </RegistryContext.Provider>
  );
  await act(async () => {
    renderer = create(view(true), {
      createNodeMock: (node) => {
        // Re-reading a host ref is not a new image load; keep its decoded dimensions.
        if (node.type === "img") return images[0]!;
        return {
          append() {},
          getContext: () => ({ drawImage() {} }),
          style: { setProperty() {} },
          getBoundingClientRect: () => ({ width: 400, height: 800 }),
        };
      },
    });
  });
  return {
    images,
    view,
    configure() {
      const json = new TextEncoder().encode(
        JSON.stringify({ width: 400, height: 800, orientation: "portrait" }),
      );
      const packet = new Uint8Array(1 + json.length);
      packet[0] = 0x82;
      packet.set(json, 1);
      sockets[0]?.onmessage?.({ data: Uint8Array.of(0x83).buffer });
      sockets[0]?.onmessage?.({ data: packet.buffer });
      videoBody?.enqueue(new Uint8Array([0, 0, 0, 5, 1, 1, 0x64, 0, 0x1f]));
    },
    frame() {
      output?.({ displayWidth: 400, displayHeight: 800, close() {} } as VideoFrame);
    },
  };
}

it("removes MJPEG requests while hidden and reconnects when shown", async () => {
  const { images, view } = await setup();
  expect(images.some((image) => image.src.includes("stream.mjpeg"))).toBe(true);
  await act(async () => renderer!.update(view(false)));
  expect(renderer!.root.findAllByType("img")).toHaveLength(0);
  expect(images.every((image) => image.src === "")).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => renderer!.update(view(true)));
  expect(images.at(-1)!.src).toContain("stream.mjpeg");
});

it("offers Reconnect after the shared timeout and receives a frame after retry with unchanged access", async () => {
  const { images } = await setup();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(
    renderer!.root.findByProps({ role: "alert" }).findByType("span").children.join(""),
  ).toContain("No video");
  expect(images.every((image) => image.src === "")).toBe(true);
  await act(async () => renderer!.root.findByType("button").props.onClick());
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  const activeImage = images.find((image) => image.src.includes("stream.mjpeg"));
  expect(activeImage).toBeDefined();
  await act(async () => {
    activeImage!.naturalWidth = 400;
    activeImage!.naturalHeight = 800;
    activeImage!.dispatchEvent(new Event("load"));
  });
  expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(0);
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("starts exactly one new stream per Reconnect press", async () => {
  await setup();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(primes).toBe(1);
  await act(async () => renderer!.root.findByType("button").props.onClick());
  expect(primes).toBe(2);
});

it("keeps the 3D viewer mounted across iOS video recovery and releases it when hidden", async () => {
  const { configure, frame, view } = await setup(true);
  await act(async () => configure());
  expect(viewerMounts).toBe(0);
  await act(async () => frame());
  expect(viewerMounts).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(viewerUnmounts).toBe(0);
  expect(viewerMounts).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
    configure();
  });
  await act(async () => frame());
  expect(viewerMounts).toBe(1);
  await act(async () => renderer!.update(view(false)));
  expect(viewerUnmounts).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
