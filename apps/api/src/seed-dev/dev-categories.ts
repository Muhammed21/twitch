import type { CaptureCover, GeneratedCover } from "./category-covers.ts";

const DEFAULT_CAPTURE = "liste-categories--defaut.png";
const SCROLLED_CAPTURE = "liste-categories--defile.png";

const captured = (
  capture: CaptureCover["capture"],
  column: CaptureCover["column"],
  top: number,
): CaptureCover => ({ kind: "capture", capture, column, top });

const generated = (hue: number): GeneratedCover => ({ kind: "generated", hue });

export type DevCategory = {
  readonly slug: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly cover: CaptureCover | GeneratedCover;
};

export const DEV_CATEGORIES: readonly DevCategory[] = [
  {
    slug: "just-chatting",
    name: "Just Chatting",
    tags: ["IRL"],
    cover: captured(DEFAULT_CAPTURE, 0, 511),
  },
  {
    slug: "marvel-rivals",
    name: "Marvel Rivals",
    tags: ["Shooter"],
    cover: captured(DEFAULT_CAPTURE, 1, 511),
  },
  {
    slug: "fortnite",
    name: "Fortnite",
    tags: ["Shooter", "RPG"],
    cover: captured(DEFAULT_CAPTURE, 2, 511),
  },
  {
    slug: "gta-v",
    name: "Grand Theft Auto V",
    tags: ["FPS", "Shooter"],
    cover: captured(DEFAULT_CAPTURE, 0, 1216),
  },
  {
    slug: "call-of-duty-warzone",
    name: "Call of Duty: Warzone",
    tags: ["FPS", "Shooter"],
    cover: captured(DEFAULT_CAPTURE, 1, 1216),
  },
  {
    slug: "minecraft",
    name: "Minecraft",
    tags: ["Simulation"],
    cover: captured(DEFAULT_CAPTURE, 2, 1216),
  },
  { slug: "irl", name: "IRL", tags: ["IRL"], cover: captured(SCROLLED_CAPTURE, 0, 757) },
  {
    slug: "call-of-duty-black-ops-6",
    name: "Call of Duty: Black Ops 6",
    tags: ["FPS", "Shooter"],
    cover: captured(SCROLLED_CAPTURE, 1, 757),
  },
  {
    slug: "roblox",
    name: "ROBLOX",
    tags: ["Platformer"],
    cover: captured(SCROLLED_CAPTURE, 2, 757),
  },
  {
    slug: "rainbow-six-siege",
    name: "Tom Clancy's Rainbow Six Siege",
    tags: ["FPS", "Shooter"],
    cover: captured(SCROLLED_CAPTURE, 0, 1520),
  },
  {
    slug: "valorant",
    name: "VALORANT",
    tags: ["FPS", "Shooter"],
    cover: captured(SCROLLED_CAPTURE, 1, 1520),
  },
  {
    slug: "league-of-legends",
    name: "League of Legends",
    tags: ["RPG", "Strategy"],
    cover: captured(SCROLLED_CAPTURE, 2, 1520),
  },
  {
    slug: "counter-strike",
    name: "Counter-Strike",
    tags: ["FPS", "Shooter"],
    cover: generated(28),
  },
  { slug: "music", name: "Music", tags: ["Creative", "Music"], cover: generated(320) },
  { slug: "art", name: "Art", tags: ["Creative"], cover: generated(285) },
  { slug: "sports", name: "Sports", tags: ["Sports"], cover: generated(140) },
  {
    slug: "software-and-game-development",
    name: "Software and Game Development",
    tags: ["Creative", "Programming"],
    cover: generated(205),
  },
  { slug: "chess", name: "Chess", tags: ["Strategy", "Board Game"], cover: generated(40) },
  { slug: "food-and-drink", name: "Food & Drink", tags: ["IRL", "Cooking"], cover: generated(12) },
  {
    slug: "travel-and-outdoors",
    name: "Travel & Outdoors",
    tags: ["IRL", "Travel"],
    cover: generated(165),
  },
  { slug: "asmr", name: "ASMR", tags: ["IRL"], cover: generated(300) },
  {
    slug: "makers-and-crafting",
    name: "Makers & Crafting",
    tags: ["Creative"],
    cover: generated(55),
  },
  {
    slug: "talk-shows-and-podcasts",
    name: "Talk Shows & Podcasts",
    tags: ["IRL", "Talk Show"],
    cover: generated(250),
  },
  {
    slug: "science-and-technology",
    name: "Science & Technology",
    tags: ["Educational"],
    cover: generated(190),
  },
  {
    slug: "fitness-and-health",
    name: "Fitness & Health",
    tags: ["Sports", "Fitness"],
    cover: generated(95),
  },
  { slug: "retro", name: "Retro", tags: ["Retro"], cover: generated(340) },
  { slug: "apex-legends", name: "Apex Legends", tags: ["FPS", "Shooter"], cover: generated(0) },
  { slug: "dota-2", name: "Dota 2", tags: ["MOBA", "Strategy"], cover: generated(355) },
  { slug: "overwatch-2", name: "Overwatch 2", tags: ["FPS", "Shooter"], cover: generated(25) },
  {
    slug: "rocket-league",
    name: "Rocket League",
    tags: ["Sports", "Driving"],
    cover: generated(220),
  },
  {
    slug: "world-of-warcraft",
    name: "World of Warcraft",
    tags: ["MMO", "RPG"],
    cover: generated(48),
  },
  {
    slug: "tabletop-rpgs",
    name: "Tabletop RPGs",
    tags: ["RPG", "Board Game"],
    cover: generated(265),
  },
];
