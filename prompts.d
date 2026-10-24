1. Project Initialization
1.1 Plan the project architecture
I am building TrustVault, a secure document-sharing platform with a real audit trail for the Snovasys Fresher Hiring Challenge 2026. Help me plan the application from the beginning. Define the core features, user roles, frontend, backend, database, file-storage architecture, security requirements, and deployment approach. Explain why each technology is suitable and give me a beginner-friendly, step-by-step implementation plan.
1.2 Create the project structure
Help me set up TrustVault from scratch using React, TypeScript, and Vite for the frontend, and Node.js, Express, and TypeScript for the backend. Propose a clean folder structure, explain the purpose of each folder, list the dependencies to install, and give the exact terminal commands. Do not skip setup steps.
1.3 Work in small, verifiable steps
Act as my coding assistant for TrustVault. Work in small stages. Before editing, inspect the existing project structure and code. Reuse the current architecture and components where possible. Make only the changes needed for the requested feature, identify the files you will modify, and provide commands to test the result. Do not claim that something works unless it has been verified.
2. Frontend Development
2.1 Create the main application interface
Build a clean, modern TrustVault frontend using React, TypeScript, and Vite. Create a consistent layout for authentication pages, dashboards, document management, workspace management, and user/profile sections. Use reusable components, responsive styling, clear loading states, and user-friendly error messages. Preserve existing routes and functionality.
2.2 Improve login and registration
Improve the TrustVault login and registration pages. Make the forms visually consistent, responsive, and easy to use. Add client-side validation for required fields and display backend validation errors clearly. Connect the forms to the existing API rather than using hard-coded success responses. Do not expose secrets or demo credentials in the UI.
2.3 Improve the company admin portal
Review the existing TrustVault dashboards and company-admin portal. Make the information hierarchy clearer and show only data the signed-in user is authorized to see. For company administrators, display their own workspace/company details and relevant employee or document counts using real backend data. Keep current routes unless a change is necessary.
2.4 Improve only search-and-filter UI
In TrustVault, improve only the search-and-filter box design wherever that component appears. Do not redesign the entire website. Make the search field, filter controls, spacing, borders, labels, and responsive behavior consistent with the existing visual theme. First find every use of the relevant component, then update it consistently without breaking its functionality.
2.5 Improve profile and animations
Make the TrustVault interface more polished by improving the user profile section, spacing, typography, cards, and subtle animations. Keep animations lightweight and accessible, support mobile and desktop layouts, and avoid changing unrelated pages or breaking existing features.
3. Backend Development
3.1 Review the Express API structure
Review the existing TrustVault Node.js, Express, and TypeScript backend. Organize the API into clear routes, middleware, utilities, and service logic. Preserve current API contracts where possible. Add appropriate request validation and centralized error handling. Before making changes, explain which files need to change and why.
3.2 Implement document APIs
Implement or review the TrustVault document APIs for listing, uploading, previewing, downloading, and deleting documents. Ensure every operation checks the authenticated user's workspace membership and document permissions. Validate document IDs and input data, return suitable HTTP status codes, and avoid exposing server filesystem paths, storage secrets, or internal error details.
3.3 Enforce permission checks
Review TrustVault's document and workspace permission middleware. Enforce permissions on the backend for every protected operation; do not rely on frontend hiding or disabling buttons. Verify that users cannot access documents from another workspace by changing a document ID or request parameter. Preserve legitimate owner, admin, editor, and viewer permissions according to the existing role model.
3.4 Review notifications
Review the TrustVault notification routes and database integration. Ensure notifications are associated with the correct user/workspace, validate requests, and return clear errors if the database operation fails. Do not return a success response when the notification was not actually saved or delivered. Keep the implementation consistent with the existing Prisma schema.
4. Database Integration
4.1 Review the Prisma schema
Inspect the current TrustVault Prisma schema and explain the models and relationships. Check that users, workspaces, memberships, documents, permissions, notifications, and audit records (where implemented) have appropriate relationships and constraints. Avoid destructive schema changes. Propose a migration plan before changing existing production data.
4.2 Configure PostgreSQL
Help me configure TrustVault to connect to the intended PostgreSQL database using environment variables and Prisma. Explain which variables must exist locally and on the hosting service, without asking me to paste passwords or secret values into chat. Verify the connection using safe commands and explain how to identify whether the application is connected to the intended database.
4.3 Diagnose Prisma errors
Diagnose the following TrustVault Prisma error using the exact error output and current schema/configuration. Identify whether the issue is caused by schema definitions, generated Prisma Client files, configuration, migrations, or database credentials. Give the smallest safe fix, the exact commands to run, and a verification step. Do not recommend deleting the database or resetting production data as a first step.

Error:
[PASTE COMPLETE ERROR LOG]
4.4 Resolve missing Prisma Client types
The TrustVault backend reports a TypeScript error indicating that a Prisma model or property is missing from the generated Prisma Client. Inspect the schema, Prisma configuration, generator output path, imports, and package versions. Recommend the correct generation command for this project, then run/check TypeScript compilation. Do not manually edit generated client files unless there is a specific, justified reason.
5. Document Storage
5.1 Diagnose missing files on the server
TrustVault's document preview/download endpoint fails with an ENOENT error for a file under server/private_uploads. The database still contains document metadata, but the file cannot be found on the deployed server. Explain the difference between database metadata and the actual file bytes, identify the risks of relying on a hosting service's local filesystem for persistent uploads, and recommend a durable storage design.
5.2 Use Supabase Storage
Update TrustVault so PostgreSQL stores document metadata and Supabase Storage stores the actual uploaded file bytes. Inspect the current document routes and Supabase client utility before editing. Use the existing private bucket named trustvault-documents. Replace local disk-based uploads with memory-based uploads, send the file buffer to Supabase Storage, and save a stable storage key in the database. Keep workspace permissions and audit behavior intact.
5.3 Fix preview and download
Review the current TrustVault document upload, preview, and download routes. Ensure preview and download retrieve the file bytes from the private Supabase Storage bucket using the saved storage key, rather than looking for a local file in server/private_uploads. Set a correct content type and safe content-disposition header. Check authorization before retrieving any file and do not expose the service-role key or permanent public URLs.
5.4 Fix file deletion
Update TrustVault document deletion so it handles the database record and the corresponding object in the private Supabase Storage bucket consistently. Check authorization first, prevent cross-workspace deletion, handle missing storage objects safely, and avoid leaving misleading success messages. Preserve required audit records. Explain how partial failures are handled.
5.5 Verify the storage setup
Help me verify that TrustVault is using the correct Supabase project and the private trustvault-documents bucket. Check configuration names and code paths without printing secret values. Give me a safe test plan: upload a new file, confirm an object appears in Storage, preview it, download it, and check that unauthorized users cannot access it.
6. Authentication and Security
6.1 Secure public registration
Review TrustVault registration. Allow users to register with validated details, hash passwords with a secure password-hashing algorithm, enforce unique email addresses, and return clear validation errors. Do not allow a public user to choose an administrator role. Do not expose database credentials, service-role keys, internal stack traces, or demo-account credentials.
6.2 Enforce workspace isolation
Review TrustVault's multi-tenant design. Every document, employee, permission, notification, and workspace-specific query must be scoped to the authenticated user's authorized workspace. Derive the user's identity and membership from trusted server-side authentication, not from client-supplied workspace IDs alone. Test attempts to access another workspace by changing IDs in API requests.
6.3 Restrict OAuth to invited employees
Plan or review Google and GitHub OAuth for TrustVault. Company access must be restricted to employees who have been invited or are already authorized members of the relevant workspace. Verify the provider identity on the backend, match invitations safely, prevent automatic privileged-role assignment, and do not treat possession of any Google or GitHub account as proof of company membership.
6.4 Review the audit trail
Review TrustVault's audit trail for document access and changes. Record the relevant actor, action, document/workspace reference, and timestamp for implemented events. Ensure audit events are created server-side after authorization and successful operations, and that ordinary users cannot edit or delete audit records. Clearly identify any audit features that are not implemented yet.
7. Bug Fixing and Troubleshooting
7.1 General error diagnosis
I encountered the following error while developing TrustVault. Read the complete error and inspect the relevant source files before proposing a fix. Explain the root cause in simple terms, identify the exact file and code path responsible, provide the smallest safe change, and give me commands to verify the fix. Do not guess or rewrite unrelated files.

Error:
[PASTE COMPLETE ERROR]
7.2 Diagnose the document preview error
TrustVault's document preview opens a blank page or fails. The backend logs show an ENOENT error for a file under server/private_uploads, even though the document appears in the database or document list. Trace the upload and preview flow end to end. Confirm whether the deployed code still uses local disk storage or has been updated to Supabase Storage. Explain the specific fix and how to verify that the new code is actually deployed.
7.3 Diagnose upload failures
File uploads in TrustVault are failing. Trace the request from the frontend through the Express upload route, storage provider, and database metadata insert. Check multipart form-data handling, file-size/type validation, environment configuration, Supabase bucket configuration, and backend logs. Identify the first failing step and propose a minimal fix without exposing secrets.
7.4 Diagnose invitation or email status
Review the TrustVault invitation flow. Verify whether an invitation is actually persisted and whether an email provider is configured and reports delivery success. Do not show a success message merely because the request was accepted. Distinguish between an invitation record being created, an email being queued, and an email being delivered. Provide clear error handling for each case.
7.5 Fix login redirection
TrustVault login succeeds but the user is not redirected to the correct dashboard. Trace authentication state, token/session storage, route guards, and role/workspace lookup. Identify the actual failure point and fix the redirect without bypassing authorization or hard-coding a dashboard for all users. Test the behavior for each supported role.
8. Deployment
8.1 Prepare for deployment
Prepare TrustVault for deployment with the frontend on the chosen hosting platform and the Express backend on Render. Identify the required build/start commands, runtime versions, environment variables, CORS settings, API base URL, and health-check endpoint. Keep secrets in the hosting provider's environment settings and do not commit .env files.
8.2 Diagnose Render build/deploy failures
Review the TrustVault Render build and runtime logs below. Identify whether the failure is due to dependency installation, TypeScript compilation, Prisma Client generation, database connectivity, missing environment variables, or runtime configuration. Give the smallest corrective change and the exact build/redeploy steps.

Logs:
[PASTE RELEVANT RENDER LOGS]
8.3 Verify the deployed commit
My local TrustVault code differs from the deployed website. Help me verify which commit is on GitHub and which commit Render has deployed. Check whether the required source files are committed and pushed, then explain how to trigger or confirm a deployment. Do not assume that editing a local file automatically updates GitHub or Render.
8.4 Resolve a rejected Git push
Git rejected my push because the remote branch contains commits that are not in my local branch. Explain how to inspect the status and reconcile the branches safely. Prefer fetching and reviewing remote changes, then rebasing or merging as appropriate. Do not recommend force-pushing or discarding work without checking the repository state first.
8.5 Verify production configuration
Give me a production verification checklist for TrustVault. Confirm that the deployed backend uses the intended PostgreSQL database and Supabase project, that required environment variables are configured, that the frontend calls the correct API URL, and that file upload/preview/download work after redeployment. Never print or commit secret values.
9. UI Improvements
9.1 Improve visual consistency
Review the current TrustVault UI and identify inconsistent spacing, typography, card styles, form controls, and responsive layouts. Improve visual consistency while preserving the existing product identity and behavior. Make focused changes and list the files modified.
9.2 Improve only search-and-filter components
Change only the search-and-filter component wherever it is used in TrustVault. Do not redesign the whole application. First locate all instances, then apply the same improved styling and responsive behavior while preserving filtering, search, and existing event handlers.
9.3 Improve loading, empty, and error states
Improve TrustVault's loading, empty, and error states for documents, employees, workspaces, and notifications. Use clear messages and appropriate retry actions. Do not show fake data or report success when an API request fails. Keep the states accessible and consistent with the current UI.
10. Testing and Final Improvements
10.1 Create a feature test checklist
Create a practical test checklist for TrustVault covering registration, login, workspace membership, document upload, listing, preview, download, deletion, permissions, audit events, and error handling. For each test, state the setup, action, expected result, and whether it requires an authorized or unauthorized account. Do not mark a test as passed until it has actually been performed.
10.2 Test cross-workspace security
Help me test TrustVault's multi-tenant security using two separate workspaces and users. Verify that a user from Workspace A cannot list, preview, download, modify, or delete Workspace B's documents by changing IDs or API parameters. Include expected HTTP responses and check server-side authorization rather than relying only on UI behavior.
10.3 Identify incomplete features honestly
Review the current TrustVault implementation and classify features as working and verified, implemented but not yet verified, partially implemented, or missing. Base the assessment on source code, test results, and deployment logs. List known bugs and remaining work honestly; do not claim that a feature is complete without evidence.
10.4 Prepare a final hackathon review
Prepare a final technical review of TrustVault for the hackathon. Summarize the problem being solved, implemented architecture, key features, AI-assisted development, bugs encountered and fixes made, tests actually performed, deployment status, and remaining limitations. Clearly separate verified contributions from AI-generated suggestions and do not invent metrics or claim unverified functionality.
11. AI-Assisted Development Workflow
11.1 Explain before editing
Before changing TrustVault code, explain the current behavior, the likely root cause of the issue, and the files that need to change. Then implement only the necessary changes. Afterward, summarize the modifications and give me commands or manual steps to verify them.
11.2 Avoid destructive fixes
Do not delete databases, reset production data, remove working features, or replace whole files without first inspecting the current implementation and explaining the risks. Prefer a minimal, reversible fix. If a destructive operation may be necessary, stop and ask me for confirmation before proceeding.
11.3 Verify code and deployment separately
For each TrustVault fix, distinguish between (1) code changed locally, (2) build/type-check passe
