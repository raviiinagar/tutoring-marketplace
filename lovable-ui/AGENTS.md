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

## Architecture
- All backend calls go through `src/lib/api.ts` (external NestJS API, cookie sessions); never add Lovable Cloud auth or local token storage — the backend owns auth.

- Keep subject exploration client-side and use shared design-system controls; planned subjects must not imply live tutor availability.
