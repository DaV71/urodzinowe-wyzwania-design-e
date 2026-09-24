import { describe, it, expect } from "vitest";
import { shouldRedirectToLogin } from "./proxy";

const none = new Headers();
const action = new Headers({ "Next-Action": "abc123" });

describe("shouldRedirectToLogin", () => {
  it("GET /admin bez sesji → przekierowanie", () => {
    expect(shouldRedirectToLogin("/admin", "GET", none, false)).toBe(true);
  });
  it("GET /admin/cokolwiek bez sesji → przekierowanie", () => {
    expect(shouldRedirectToLogin("//Admin/x", "GET", none, false)).toBe(true);
  });
  it("GET /admin z sesją → przepuszcza", () => {
    expect(shouldRedirectToLogin("/admin", "GET", none, true)).toBe(false);
  });
  it("POST z next-action bez sesji → przepuszcza (akcja sama woła requireAdmin)", () => {
    expect(shouldRedirectToLogin("/admin", "POST", action, false)).toBe(false);
  });
  it("POST bez next-action bez sesji → przekierowanie", () => {
    expect(shouldRedirectToLogin("/admin", "POST", none, false)).toBe(true);
  });
  it("GET z next-action bez sesji → przekierowanie (tylko POST jest akcją)", () => {
    expect(shouldRedirectToLogin("/admin", "GET", action, false)).toBe(true);
  });
  it("/admin/login → przepuszcza", () => {
    expect(shouldRedirectToLogin("/admin/login", "GET", none, false)).toBe(false);
  });
  it("strona jubilata → przepuszcza", () => {
    expect(shouldRedirectToLogin("/", "GET", none, false)).toBe(false);
  });
});
