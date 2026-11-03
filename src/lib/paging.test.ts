import { expect, test } from "bun:test";
import { pageCount, pageNumbers, pageSlice } from "./paging";

test("286 drugs at 25 per page is 12 pages", () => expect(pageCount(286, 25)).toBe(12));
test("an empty list still has one page", () => expect(pageCount(0, 25)).toBe(1));
test("page 2 holds items 26–50", () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1);
  expect(pageSlice(items, 2, 25)).toEqual(items.slice(25, 50));
});
test("a page past the end shows the last page", () => expect(pageSlice([1, 2, 3], 9, 2)).toEqual([3]));
test("page buttons: all when few, gaps when many", () => {
  expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  expect(pageNumbers(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  expect(pageNumbers(1, 12)).toEqual([1, 2, null, 12]);
});
