const hostedAppChannel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();

export const HOSTED_APP_CHANNEL = hostedAppChannel === "latest" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL = HOSTED_APP_CHANNEL === "latest" ? "Latest" : null;
export const APP_BASE_NAME = "Elysia";
export const APP_STAGE_LABEL = import.meta.env.DEV ? "Dev" : "";
export const APP_DISPLAY_NAME = "Elysia";
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
