# Campfire (campfire.raisedcurious.com)

Conversation card deck for families: 265 questions and dares across five
levels (Spark, Kindling, Bonfire, Dares, Embers). Static single-page site,
localStorage-based memory, no backend.

## Deploy
Cloudflare Pages. IMPORTANT current state: the live site is a DIRECT UPLOAD
Pages project, so pushing to this repo does NOT deploy yet. After the
migration to a Git-connected Pages project, push-to-main deploys. Check with
Matt which state applies before assuming a push went live.

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
