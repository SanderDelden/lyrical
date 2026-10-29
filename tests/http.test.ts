import { describe, expect, it } from "vitest";
import { clearCookie, randomPairCode, randomToken, readCookie, setCookie } from "@/lib/http";
import { isPairCode } from "@/lib/store";

const withCookie = (cookie: string) => new Request("https://lyrical.example/", { headers: { cookie } });

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie(withCookie("a=1; lyrical_session=abc; b=2"), "lyrical_session")).toBe("abc");
  });

  it("decodes the value and keeps '=' inside it", () => {
    expect(readCookie(withCookie("state=x%3AABCD2345; other=1"), "state")).toBe("x:ABCD2345");
    expect(readCookie(withCookie("token=a=b=c"), "token")).toBe("a=b=c");
  });

  it("returns undefined when the cookie or the header is missing", () => {
    expect(readCookie(withCookie("a=1"), "b")).toBeUndefined();
    expect(readCookie(new Request("https://lyrical.example/"), "a")).toBeUndefined();
  });

  it("does not match on a name prefix", () => {
    expect(readCookie(withCookie("lyrical_session_old=1"), "lyrical_session")).toBeUndefined();
    expect(readCookie(withCookie("lyrical_session=%zz"), "lyrical_session")).toBeUndefined();
  });
});

describe("setCookie", () => {
  it("is HttpOnly, SameSite=Lax and Secure on https", () => {
    const cookie = setCookie(new Request("https://lyrical.example/"), "name", "a:b", 600);
    expect(cookie).toBe("name=a%3Ab; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure");
  });

  it("leaves out Secure on plain http, so local development works", () => {
    const cookie = setCookie(new Request("http://127.0.0.1:5173/"), "name", "value", 600);
    expect(cookie).not.toContain("Secure");
  });

  it("is expired immediately by clearCookie", () => {
    expect(clearCookie(new Request("https://lyrical.example/"), "name")).toContain("name=; Path=/");
    expect(clearCookie(new Request("https://lyrical.example/"), "name")).toContain("Max-Age=0");
  });
});

describe("random values", () => {
  it("randomToken returns hex of the requested byte length", () => {
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(randomToken(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("randomPairCode returns 8 characters that the store accepts as a pair code", () => {
    for (let i = 0; i < 200; i++) {
      const code = randomPairCode();
      expect(code).toHaveLength(8);
      expect(isPairCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });
});
