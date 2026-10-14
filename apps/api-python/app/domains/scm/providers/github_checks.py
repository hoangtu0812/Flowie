class GitHubChecks:
    """Bounded CI reads through the existing GitHub installation credential."""

    def __init__(self, provider, repository):
        self.provider = provider
        self.root = f"https://api.github.com/repos/{repository}"

    async def pull(self, number):
        return (
            await self.provider._request("GET", f"{self.root}/pulls/{number}")
        ).json()

    async def snapshot(self, commit):
        checks = (
            await self.provider._request(
                "GET",
                f"{self.root}/commits/{commit}/check-runs",
                params={"per_page": 100, "filter": "latest"},
            )
        ).json()
        statuses = (
            await self.provider._request(
                "GET", f"{self.root}/commits/{commit}/status", params={"per_page": 100}
            )
        ).json()
        workflows = (
            await self.provider._request(
                "GET",
                f"{self.root}/actions/runs",
                params={"head_sha": commit, "per_page": 100},
            )
        ).json()
        return checks, statuses, workflows
