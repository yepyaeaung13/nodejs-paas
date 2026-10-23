import { updateApp, type AppRow } from "../db.js";
import { fetchGithubBranch, type CommitInfo } from "./git.js";
import { getBranch, getInstallationToken, getRepositoryById } from "./github.js";

export async function syncGithubSource(app: AppRow): Promise<CommitInfo> {
  if (app.source_type !== "github") throw new Error("This app is not configured for GitHub");
  if (
    app.github_installation_id === null ||
    app.github_repo_id === null ||
    !app.github_branch
  ) {
    throw new Error("This app has incomplete GitHub source settings");
  }
  const installationId = app.github_installation_id;
  const repository = await getRepositoryById(installationId, app.github_repo_id);
  const branch = await getBranch(installationId, repository, app.github_branch);
  if (repository.fullName !== app.github_repo_full_name) {
    updateApp(app.id, { githubRepoFullName: repository.fullName });
  }
  const token = await getInstallationToken(installationId);
  return fetchGithubBranch(app, repository, app.github_branch, token, branch.sha);
}
