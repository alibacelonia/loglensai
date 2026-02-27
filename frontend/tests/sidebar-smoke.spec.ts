import { expect, test } from "@playwright/test";

test.describe("Sidebar smoke", () => {
  test("auth redirect and sidebar pages render", async ({ page, request }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);

    const username = `smoke_${Date.now()}`;
    const email = `${username}@example.com`;
    const password = "StrongPass123!";

    const register = await request.post("/api/auth/register", {
      data: {
        username,
        email,
        password,
        password_confirm: password
      }
    });
    expect(register.ok()).toBeTruthy();

    const cookieHeader = register
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value)
      .join("\n");

    const accessMatch = cookieHeader.match(/loglens_access=([^;]+)/);
    const refreshMatch = cookieHeader.match(/loglens_refresh=([^;]+)/);
    expect(accessMatch).toBeTruthy();
    expect(refreshMatch).toBeTruthy();

    await page.context().addCookies([
      {
        name: "loglens_access",
        value: accessMatch?.[1] || "",
        domain: "localhost",
        path: "/"
      },
      {
        name: "loglens_refresh",
        value: refreshMatch?.[1] || "",
        domain: "localhost",
        path: "/"
      }
    ]);

    const routes: Array<{ path: string; title: string }> = [
      { path: "/", title: "Dashboard" },
      { path: "/upload-logs", title: "Upload Logs" },
      { path: "/live-tail", title: "Live Tail" },
      { path: "/anomalies", title: "Anomalies" },
      { path: "/incidents", title: "Incidents" },
      { path: "/reports", title: "Reports" },
      { path: "/integrations", title: "Integrations" },
      { path: "/settings", title: "Settings" }
    ];

    for (const route of routes) {
      await page.goto(route.path);
      const escapedPath = route.path.replace("/", "\\/");
      await expect(page).toHaveURL(new RegExp(`${escapedPath}$`));
      await expect(page.getByRole("heading", { name: route.title, exact: true })).toBeVisible();
    }
  });
});
