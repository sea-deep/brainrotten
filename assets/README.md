# Third-party media (not in git)

Videos use cartoon character cutouts, AI voice clones and background gameplay clips that belong to other people. None of it is committed to this repository, and none of it is covered by the MIT licence. Owners and credits: [NOTICE.md](../NOTICE.md).

Maintainers keep it in a private, encrypted S3 bucket (stack `brainrotten-ci`, output `MediaBucketName`) and copy it with:

```bash
pnpm media:pull          # cutouts, gameplay clips, posters and the social image
pnpm media:pull --all    # also voice clip lists, references and example videos
pnpm media:push          # upload local changes
```

The layout it restores, which the code expects:

```
assets/
  characters/<show>/<id>.png    transparent character cutouts; ids match packages/media/src/characters.ts
  characters/<show>/voices/     clip lists used to make each voice clone (audio stays local)
  characters/<show>/references/ where the cutouts came from
  gameplay/<name>.mp4           muted, cropped background clips
```

Running without the private media: everything builds and the tests pass. To render videos, add your own cutouts (`assets/characters/<show>/<id>.png`) and background clips (`assets/gameplay/*.mp4`), using media you have the rights to. A test fails if any of these files is ever committed, and a pre-push check blocks pushing them (install it once with `git config core.hooksPath scripts/git-hooks`).
