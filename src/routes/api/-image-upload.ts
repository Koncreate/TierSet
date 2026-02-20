import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getUploadUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      filename: z.string(),
      contentType: z.string(),
    }),
  )
  .handler(async () => {
    const key = crypto.randomUUID();
    const uploadUrl = `/api/image-upload/mock/${key}`;

    return {
      uploadUrl,
      key,
    };
  });

export const confirmUpload = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      key: z.string(),
    }),
  )
  .handler(async ({ data: { key } }) => {
    return {
      url: `local://${key}`,
    };
  });
