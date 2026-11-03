import { expect, test } from "bun:test";
import { cacheAction, isKeptKey } from "./cacheReset";

test("a browser seeing the version for the first time only remembers it", () => expect(cacheAction(null, "v1")).toBe("remember"));
test("same version: nothing to clear", () => expect(cacheAction("v1", "v1")).toBe("none"));
test("new version from the admin: clear", () => expect(cacheAction("v1", "v2")).toBe("clear"));
test("no version set yet: nothing happens", () => expect(cacheAction("v1", null)).toBe("none"));
test("sign-in is kept, drafts are not", () => {
  expect(isKeptKey("sb-nvkmadptjotclbcighbj-auth-token")).toBe(true);
  expect(isKeptKey("hims-draft:abc:pharmacy-add-drug")).toBe(false);
  expect(isKeptKey("draft-encounter-123")).toBe(false);
});
