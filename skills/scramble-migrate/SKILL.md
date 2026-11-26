---
name: trybe-scramble-migrate
description: Migrate a section of packages/shop routes from hand-written OpenAPI docs to Scramble auto-generated docs — single-action controllers, request/resource classes with Scramble doc comments, updated routes and AppServiceProvider allowlist. Use when the user names a tag/section from the Scramble migration progress checklist (.scratch/scramble-migration/00-progress.md) and asks to migrate it.
---

# Scramble Migration

> Personal override for Claude Code cloud sessions: identical to trybe's `scramble-migrate` except
> that verification runs through `./bin/dev` from `/home/user/trybe`, because the host `php` is 8.3
> and can't run shop.

Migrate one section of `packages/shop` routes at a time from the hand-written OpenAPI
spec (`packages/docs/endpoints`) to routes documented automatically by
[Scramble](https://scramble.dedoc.co/).

## Scope

- Work on exactly **one** `## <Tag>` section at a time from
  `.scratch/scramble-migration/00-progress.md` — whichever tag the user names.
- Before starting, list the unchecked routes under that heading back to the user so
  you both agree on scope for this run. Don't range beyond that section.
- `packages/docs/endpoints/**` (and the compiled `packages/docs/compiled-spec/bundled.yaml`)
  is **reference-only**. Read it to compare request/response shapes for correctness —
  never edit it. This is a documentation-generation migration, not a contract change,
  so `guides/agents/public-api-docs.md` (which governs actual contract changes) does
  not apply here.
- The checklist file itself is not yours to edit — at the end of the run, tell the
  user which routes are now done so they can check them off themselves.

## Workflow

For every route in the section:

### 1. Controller conversion

- Convert the controller action into a single-action invokable controller
  (`public function __invoke(...)`).
- If the existing controller handles multiple routes (e.g. a `Route::resource(...)`
  controller), only extract the action(s) actually in scope for this section. Leave
  the rest of the resource controller in place and narrow its
  `Route::resource(...)->only([...])` list to exclude the extracted action(s) — see
  `Route::get('appointment-types/{appointmentType}/price-rules', ListAppointmentPriceRulesController::class)`
  next to `Route::resource('appointment-types.price-rules', AppointmentPriceRuleController::class)->scoped()->only('show', 'store', 'update', 'destroy')`
  in `packages/shop/routes/api.php` for the established pattern. Do not fully
  dismantle a resource controller unless every one of its actions is in scope.
- Add a `#[\Dedoc\Scramble\Attributes\Group('...')]` attribute above the class and a
  short one-line PHPDoc comment on `__invoke()` naming the operation — this becomes
  the Scramble operation summary. The Group name doesn't need to match the old
  hand-written spec's `tags:` value; pick whatever groups related operations
  sensibly (existing migrated controllers often use a more granular name than the
  old tag, e.g. `Appointment Price Rules` vs the old `AppointmentTypes` tag).
- Give the Group a parent when it belongs under a broader area, e.g.
  `#[Group('Discount Usage', parent: 'Reporting')]` or
  `#[Group('Users', parent: 'Administration')]`. Before choosing names, list the
  groups and parents already in use (`grep -rh "#\[Group(" packages/shop/app`) and
  reuse an existing parent where one fits.
- OpenAPI group (tag) names must be unique across every parent and child. A child
  can't share a name with a parent or with a child under a different parent, so
  `#[Group('Sites', parent: 'Administration')]` rules out another `Sites` group
  anywhere else. Make the child name more specific instead (e.g. `Site Settings`).

### 2. Request classes

- Move authorization and validation out of the controller and into a `FormRequest`.
- Authorization should use the `$this->siteUser($site_id)->can('ability', $resource)`
  pattern rather than `authorizeForUser`, where `$site_id` and `$resource` typically
  come from route model bindings (e.g. `$this->appointmentType->site_id`,
  `$this->appointmentType`). Use the `RestrictsForSite` trait
  (`app/Http/Controllers/Traits/RestrictsForSite.php`) when it's more convenient to
  resolve the site ID that way.
- Add PHPDoc comments above each validation rule that Scramble will surface as field
  documentation: a description, `@default` for fields with a default, and `@example`
  where a realistic example clarifies the shape. Compare field names, types, and
  requiredness against the corresponding entry in `packages/docs/endpoints` and use
  judgement — the hand-written spec may be stale or wrong.
- Use `App\Http\Requests\AreaBookingPriceRules\ListAreaBookingPriceRulesRequest` as
  the reference for what a fully migrated request class should look like.
- Validate `per_page` as `['nullable', 'integer', 'min:1', 'max:100']`, with a
  `@default` matching the controller's default page size. Also allow `-1`, using
  `['nullable', 'integer', 'between:-1,100', 'not_in:0']`, when any of these holds:
  - the existing validation already explicitly allows `-1`;
  - the controller explicitly handles `-1`, e.g. `SessionController` checks
    `$perPage < 0`;
  - sending `-1` already returns every result, e.g. MongoDB's `paginate(-1)`. Confirm
    this with a feature test that creates more records than the default page size.

  When `-1` is allowed, add this to the parameter's doc comment: "Sending `-1` returns
  every result. This is deprecated and will be removed in a future version."
  `ListAreaBookingTypesRequest` is the reference. The controller's `per_page` logic
  stays exactly as it is: change only validation and docs, even where `-1` gives
  wrong pagination meta. In the final report, list each `per_page` you changed and
  which of these cases applied.

### 3. Resource classes

- Controllers must return JSON resources (`JsonResource`/`ResourceCollection`), never
  raw arrays or models.
- Add PHPDoc comments Scramble can use for response documentation: a description,
  `@example`, and `@var` when Scramble cannot infer the correct type on its own.
  Preserve nullability precisely — e.g. `@var string|null` when a field can be null
  and Scramble can't infer that from the code.
- Replace `new MissingValue` conditionals with `->when(...)`.
- **Never remove a field from a response**, even if it looks unused or the
  hand-written spec omits it — other clients may depend on it. When the hand-written
  spec and the implementation disagree, trust the implementation for correctness but
  flag the discrepancy to the user.

### 4. File organization

- Group controllers, requests, and resources for a feature together by directory,
  e.g. `App\Http\Controllers\Discounts`, `App\Http\Requests\Discounts`,
  `App\Http\Resources\Discounts`, named like `CreateDiscountController`. Some older
  resources are still flat under `App\Http\Resources` — that's legacy, not the
  target pattern; put new/moved classes in the grouped location.

### 5. Routing and allowlist

- Update the route definition(s) in `packages/shop/routes/*.php` to point at any
  new/moved controllers.
- Add the migrated route(s) to the array passed to `Scramble::configure()->routes()`
  in `packages/shop/app/Providers/AppServiceProvider.php`, matching the existing
  `METHOD-METHOD uri` string format (e.g. `'GET-HEAD shop/appointment-types/{appointmentType}/price-rules'`,
  `'PUT shop/discount-types/{discountType}'`).

### 6. Cleanup

- Delete any old controllers, requests, or resources that are now unused as a result
  of the split.

## Unimplemented routes (spec-only, no code anywhere)

Occasionally a checklist route has a hand-written OpenAPI spec entry in
`packages/docs/endpoints` but **no backing Laravel route/controller in any
package** — not `shop`, and not `auth`/`customer`/`inventory` either. Don't
guess an implementation or invent a dummy contract for these. Skip the route,
leave it unchecked, and tell the user it needs investigation/implementation
before it can be migrated. Call this out explicitly in the finishing-up report
alongside any other skipped/deferred routes.

## Routes owned by another package (auth, customer, inventory)

Some routes in a section aren't implemented in `packages/shop` at all — they're
served by `auth`, `customer`, or `inventory`, but still need to appear in Scramble's
output because the goal is one generated spec for the whole public API. Recognize
these by checking whether a route from the checklist has a real Laravel route in
`packages/shop/routes/*.php` — if it doesn't, check `packages/auth`, `packages/customer`,
and `packages/inventory` for the real implementation instead (e.g. `/users`, `/roles`,
`/permissions`, `/sites`, `/admin/*` live in `auth`; `/customers/*` in `customer`;
`/inventory/*` in `inventory`).

**Never change the original route, controller, request, or resource in the owning
package.** Those will be migrated into `shop` for real as a separate, later effort.
Instead, build a **dummy** equivalent inside `packages/shop`, following the existing
`packages/shop/routes/customer.php` + `App\DummyCustomers\*` example:

1. **Routes file** — create (or extend) `packages/shop/routes/<domain>.php` (e.g.
   `routes/auth.php`, `routes/inventory.php`) with a top comment explaining these
   routes are fake and only exist to build the OpenAPI spec, then define one
   `Route::get|post|put|delete(...)` per operation pointing at a new dummy
   controller — mirror the real package's URL structure/prefix as closely as
   possible so the documented path matches the real public path.
2. **Registration** — register the file in
   `packages/shop/app/Providers/RouteServiceProvider.php` the same way
   `mapCustomerRoutes()` registers `routes/customer.php` (a `Route::prefix(...)->group(...)` call
   added to `boot()`), with a `/** Register dummy <domain> routes */` doc comment.
3. **Controllers** — under `App\Dummy<Domain>\Controllers`, one single-action
   invokable controller per operation. Since there's no real request/response
   backing these, controllers document their own contract directly:
   - `#[Group('...')]` on the class, a one-line summary + longer description on
     `__invoke()` (matching the style/content of the real hand-written spec entry).
   - Document query/body parameters with `#[\Dedoc\Scramble\Attributes\QueryParameter(...)]` /
     `#[\Dedoc\Scramble\Attributes\BodyParameter(...)]` attributes directly on
     `__invoke()` (name, description, type, `required` where applicable) — there is
     no `FormRequest` for dummy routes.
   - Body of `__invoke()` always follows the same unreachable-by-design shape (it
     is never actually called in production — real traffic never reaches these
     routes):
     ```php
     public function __invoke(): SomeResource
     {
         throw new \Illuminate\Auth\AuthenticationException;
         throw new \Illuminate\Auth\Access\AuthorizationException;
         throw new \Illuminate\Database\RecordsNotFoundException; // only if the real endpoint can 404
         $this->validate();

         return new SomeResource(null);
         // or: return SomeResource::collection(new \Illuminate\Pagination\LengthAwarePaginator([], 0, 15));
     }
     ```
4. **Resources** — reuse a real resource class if the domain already has a
   genuine (non-dummy) equivalent living in `packages/shop` (e.g.
   `App\Customers\Http\Resources\CustomerResource` is a real class already used
   elsewhere in shop, so `App\DummyCustomers\Controllers\ShowCustomerController`
   reuses it directly rather than duplicating it). Otherwise create a new resource
   under `App\Dummy<Domain>\Resources` that fabricates the shape entirely by hand:
   every field gets a placeholder value (`''`, `new SomeOtherResource(null)`,
   `SomeResource::collection([])`, etc.) plus a comment documenting the field
   (description, `@var` union/enum type, `@format`, `@deprecated` as needed) —
   see `App\DummyCustomers\Resources\MembershipResource` as the reference example
   for a fully fabricated nested resource shape.
5. **Allowlist** — add these dummy routes to `Scramble::configure()->routes()` in
   `AppServiceProvider` exactly like any other migrated route.

Compare every dummy controller/resource's documented shape carefully against the
real implementation in the owning package (models, form requests, API resources) and
the hand-written spec in `packages/docs/endpoints` — the dummy version is the only
thing generating this documentation, so it must be accurate even though the code
path itself is unreachable.

## Verification

Run from `/home/user/trybe` (the repo root), never the host `php` or `vendor/bin`:

- `./bin/dev test shop <test file(s)> --filter=<relevant test(s)>` first, then a
  broader `./bin/dev test shop <touched test directory>` pass to confirm nothing
  else broke. Leave the whole suite to CI.
- `./bin/dev exec shop vendor/bin/pint --dirty --format agent` to fix formatting
  on changed files, then `./bin/dev lint shop --diff` for Rector and PHPStan.
- `./bin/dev artisan shop scramble:export --path=export.json` to generate the current Scramble
  output and spot-check the migrated operations' shapes against the corresponding
  entries in `packages/docs/endpoints`.

**Do not modify any tests.** These changes are documentation-only and must continue
to satisfy the existing test suite unchanged. If a test fails, fix the
implementation, not the test. The one exception: add a new feature test when you
need to confirm that `per_page=-1` already returns every result (see Request
classes). Add no other tests.

## Finishing up

Report back:

- Which route(s) from the section are now fully migrated (controller, request,
  resource, route, and `AppServiceProvider` allowlist all updated).
- Any route(s) skipped or deferred, and why.
- Any discrepancies found between the hand-written spec and the implementation that
  the user should be aware of.
- Confirmation that Pint and the test suite are clean.

The user maintains `.scratch/scramble-migration/00-progress.md` themselves — don't
edit it, just give them enough detail to check items off.
