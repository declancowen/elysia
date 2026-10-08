import { expect, it } from "vite-plus/test";
import { WorkTaskId } from "@elysiatools/contracts";
import { taskPrompt } from "./taskPrompt.ts";

it("sends readable task content while preserving entities, paragraphs, links and checklist states", () => {
  const prompt = (description: string) =>
    taskPrompt({ id: WorkTaskId.make("TASK-1"), title: "Review", description });
  const html =
    '<p>What is the time &amp; date?</p><p>Use <strong>UK</strong><br>time.</p><ul data-type="taskList"><li data-checked="false"><p>Check <a href="https://example.com">the source</a></p></li><li data-checked="true"><p>Keep &#x1F680;</p></li></ul><pre><code>2 &lt; 3\n&lt;p&gt;literal&lt;/p&gt;</code></pre>';
  expect(prompt(html)).toBe(
    "Work on [Review](t3-context://v1/task/TASK-1)\n\nWhat is the time & date?\n\nUse UK\ntime.\n\n- [ ] Check the source (https://example.com)\n- [x] Keep 🚀\n\n2 < 3\n<p>literal</p>\n\nRead this task in Elysia and update its progress. Mark it done only when the work is complete.",
  );
  expect(prompt("2 < 3\nLeave <file> alone")).toContain("2 < 3\nLeave <file> alone");
  expect(prompt("<p></p>")).not.toContain("\n\n\n");
  expect(prompt(html)).not.toContain("t3_task_");
});
