# Fix Car-Part.com Scraper - Page Fetching

## Problem
1. Page 1 results are discarded when totalPages > 1 (line 402 starts with empty array)
2. For 3 pages, `selectPagesToFetch` returns only [2], missing pages 1 and 3
3. User expects: if <= 3 pages, fetch ALL pages

## Fix Plan

- [x] Update `selectPagesToFetch` to return [2, ..., totalPages] for <= 3 pages
- [x] Keep page 1 results from initial fetch (don't discard them)
- [ ] Test the fix

## Changes Made

### selectPagesToFetch (line ~532)
- For <= 3 pages: return [2, 3] or [2] (page 1 already fetched)
- Keep existing logic for 4+ pages

### searchCarPartCom (line ~385)
- Parse page 1 results before the loop
- Initialize allListings with page 1 results

## Review

Two bugs fixed:

1. **Page 1 results were discarded** - When totalPages > 1, the code started with an empty array and only fetched additional pages. Now page 1 results are kept and added to allListings.

2. **selectPagesToFetch skipped pages for small results** - For 3 pages, it returned only [2] (skipping pages 1 and 3). Now for <= 3 pages, it returns all remaining pages [2, 3].

Example behavior:
- 1 page: returns page 1 only
- 2 pages: returns pages 1 + 2 (all)
- 3 pages: returns pages 1 + 2 + 3 (all)
- 4+ pages: sampling logic unchanged
