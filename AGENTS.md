<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep former surface pit coordinates as bonus-room entrance metadata when generating replacement pipes, so secret-room indexing remains deterministic across clients.
- Render green pipes as a single CDN-backed sprite across their tile footprint to preserve reference artwork without tile seams.
- Render player-one uploaded artwork with an idle sprite and a timed GIF-derived sprite sheet; keep collision dimensions and Amiibo palette rendering unchanged because artwork must not alter gameplay or customization.
