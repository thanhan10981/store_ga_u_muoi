import { expect, it } from "vitest";
import { z } from "zod";
import { storeChatRequest } from "../src/lib/store-chat-request";

it("keeps text-only chat compatible with the strict legacy backend", () => {
  const oldSchema = z.object({ message: z.string().trim().min(1).max(6000) }).strict();
  expect(oldSchema.parse(storeChatRequest("Tôi có gửi Excel được không?", []))).toEqual({message:"Tôi có gửi Excel được không?"});
});
it("preserves attachment data and file-only messages for the updated backend", () => {
  const files = [{ name:"data.csv",data:"YQ==" }];
  expect(storeChatRequest("",files)).toEqual({message:"",attachments:files});
});
