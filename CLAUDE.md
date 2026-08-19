# Campfire (campfire.raisedcurious.com)

Conversation card deck for families: 305 questions and dares across six
levels (Spark, Kindling, Bonfire, Roast, Dares, Embers). Static single-page
site, localStorage-based memory, no backend.

## Deploy
Cloudflare Pages, Git-connected as of 2026-08-19: push to main and the
`campfire-git` project builds and serves campfire.raisedcurious.com. The
migration is done; the old DIRECT UPLOAD project `campfire`
(campfire-3tb.pages.dev) is an orphan with no custom domain attached, so
never deploy to it. Verify a push went live with
`wrangler pages deployment list --project-name campfire-git`.

## HARD RULES
1. data/campfire-cards.json is the append target for a nightly card pipeline:
   any additions must match the existing card schema exactly, and the file
   must never be restructured or wholesale-regenerated.
2. The youngest-player age setting gates which levels are available. This is
   a safety feature: never remove or weaken it, especially around the Embers
   (adult) level. Embers exists because the co-parent bond feeds everything
   else on this brand; keep its framing intact.
3. Keep _headers and robots.txt; they ship with the site.
4. Brand: this is a parent-facing RaisedCurious property (Lato / Courier
   Prime, Field Guide adjacent), not the candy Play sub-brand.
