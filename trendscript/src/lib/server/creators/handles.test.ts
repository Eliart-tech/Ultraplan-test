import { describe, expect, it } from "vitest";
import { creatorProfileUrl, normalizeHandle } from "./handles";

describe("normalizeHandle", () => {
  it("reads Instagram usernames and profile URLs", () => {
    expect(normalizeHandle("instagram", "@Hugo.Decrypte")).toBe("hugo.decrypte");
    expect(normalizeHandle("instagram", "hugodecrypte")).toBe("hugodecrypte");
    expect(normalizeHandle("instagram", "https://www.instagram.com/hugodecrypte/?hl=fr")).toBe("hugodecrypte");
    expect(normalizeHandle("instagram", "instagram.com/hugodecrypte/reels/")).toBe("hugodecrypte");
    expect(normalizeHandle("instagram", "  <@nasa>  ")).toBe("nasa");
  });

  it("rejects Instagram post URLs, other sites and invalid names", () => {
    expect(normalizeHandle("instagram", "https://www.instagram.com/p/DX7lzTOJ1p6/")).toBeNull();
    expect(normalizeHandle("instagram", "https://www.instagram.com/reel/DX7lzTOJ1p6/")).toBeNull();
    expect(normalizeHandle("instagram", "https://www.tiktok.com/@hugodecrypte")).toBeNull();
    expect(normalizeHandle("instagram", "hugo decrypte")).toBeNull();
    expect(normalizeHandle("instagram", "hugo-decrypte")).toBeNull();
    expect(normalizeHandle("instagram", "")).toBeNull();
  });

  it("reads TikTok usernames and URLs (profile or video)", () => {
    expect(normalizeHandle("tiktok", "@Shaiie_Foeva")).toBe("shaiie_foeva");
    expect(normalizeHandle("tiktok", "https://www.tiktok.com/@shaiie_foeva")).toBe("shaiie_foeva");
    expect(normalizeHandle("tiktok", "https://www.tiktok.com/@shaiie_foeva/video/7535448384170331414?lang=fr")).toBe("shaiie_foeva");
    // Short links cannot be resolved without following them.
    expect(normalizeHandle("tiktok", "https://vm.tiktok.com/ZMabc123/")).toBeNull();
    expect(normalizeHandle("tiktok", "a")).toBeNull();
  });

  it("reads YouTube handles, channel ids and URLs", () => {
    expect(normalizeHandle("youtube", "@Squeezie")).toBe("Squeezie");
    expect(normalizeHandle("youtube", "Squeezie")).toBe("Squeezie");
    expect(normalizeHandle("youtube", "https://www.youtube.com/@Squeezie/videos")).toBe("Squeezie");
    expect(normalizeHandle("youtube", "m.youtube.com/@hugodecrypteactus")).toBe("hugodecrypteactus");
    expect(normalizeHandle("youtube", "https://www.youtube.com/channel/UCWeg2Pkate69NFdBeuRFTAw")).toBe("UCWeg2Pkate69NFdBeuRFTAw");
    expect(normalizeHandle("youtube", "UCWeg2Pkate69NFdBeuRFTAw")).toBe("UCWeg2Pkate69NFdBeuRFTAw");
    expect(normalizeHandle("youtube", "https://www.youtube.com/c/Squeezie")).toBe("Squeezie");
  });

  it("rejects YouTube video links", () => {
    expect(normalizeHandle("youtube", "https://www.youtube.com/watch?v=2QcaDwpvl7s")).toBeNull();
    expect(normalizeHandle("youtube", "https://youtu.be/2QcaDwpvl7s")).toBeNull();
    expect(normalizeHandle("youtube", "https://www.youtube.com/shorts/2QcaDwpvl7s")).toBeNull();
    expect(normalizeHandle("youtube", "ab")).toBeNull();
  });

  it("reads LinkedIn members and company pages (company pages keep a prefix)", () => {
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/in/romainfargeot/")).toBe("romainfargeot");
    expect(normalizeHandle("linkedin", "fr.linkedin.com/in/j%C3%A9zabel-couppey-soubeyran-6b62673b")).toBe("jézabel-couppey-soubeyran-6b62673b");
    expect(normalizeHandle("linkedin", "@RomainFargeot")).toBe("romainfargeot");
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/company/google/posts/?feedView=all")).toBe("company/google");
    expect(normalizeHandle("linkedin", "company/Google")).toBe("company/google");
  });

  it("rejects LinkedIn post URLs and other pages", () => {
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/posts/romainfargeot_x-activity-7511658849477640192-H9d2")).toBeNull();
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/feed/")).toBeNull();
    expect(normalizeHandle("linkedin", "romain fargeot")).toBeNull();
  });
});

describe("creatorProfileUrl", () => {
  it("builds the public profile URL of each platform", () => {
    expect(creatorProfileUrl("instagram", "nasa")).toBe("https://www.instagram.com/nasa/");
    expect(creatorProfileUrl("tiktok", "shaiie_foeva")).toBe("https://www.tiktok.com/@shaiie_foeva");
    expect(creatorProfileUrl("youtube", "Squeezie")).toBe("https://www.youtube.com/@Squeezie");
    expect(creatorProfileUrl("youtube", "UCWeg2Pkate69NFdBeuRFTAw")).toBe("https://www.youtube.com/channel/UCWeg2Pkate69NFdBeuRFTAw");
    expect(creatorProfileUrl("linkedin", "romainfargeot")).toBe("https://www.linkedin.com/in/romainfargeot/");
    expect(creatorProfileUrl("linkedin", "company/google")).toBe("https://www.linkedin.com/company/google/");
    expect(creatorProfileUrl("linkedin", "jézabel-couppey")).toBe("https://www.linkedin.com/in/j%C3%A9zabel-couppey/");
  });
});
