import { ProblemException } from "../problem.ts";
import type { ImageRejection } from "./finalize-image.ts";
import { IMAGE_PURPOSES, type ImagePurpose, MAX_INPUT_PIXELS } from "./image-purposes.ts";

const SUBJECT: Readonly<Record<ImagePurpose, string>> = {
  avatar: "Une image d'avatar",
  banner: "Une bannière",
  category: "Une image de catégorie",
};

const MIB = 1024 * 1024;

const PROBLEMS: Readonly<
  Record<ImageRejection, (purpose: ImagePurpose) => { title: string; detail: string }>
> = {
  upload_not_found: () => ({
    title: "Envoi introuvable",
    detail: "Préparez un nouvel envoi : celui-ci n'existe pas ou a expiré.",
  }),
  too_large: (purpose) => ({
    title: "Image trop lourde",
    detail: `${SUBJECT[purpose]} pèse au plus ${IMAGE_PURPOSES[purpose].maxBytes / MIB} Mio.`,
  }),
  unsupported_type: () => ({
    title: "Type d'image refusé",
    detail: "Envoyez une image JPEG, PNG ou WebP.",
  }),
  too_small: (purpose) => ({
    title: "Image trop petite",
    detail: `${SUBJECT[purpose]} mesure au moins ${IMAGE_PURPOSES[purpose].minWidth} × ${IMAGE_PURPOSES[purpose].minHeight} pixels.`,
  }),
  too_many_pixels: () => ({
    title: "Image trop grande",
    detail: `Une image compte au plus ${MAX_INPUT_PIXELS / 1_000_000} millions de pixels.`,
  }),
};

export const imageRejected = ({
  rejection,
  purpose,
}: {
  rejection: ImageRejection;
  purpose: ImagePurpose;
}): ProblemException => new ProblemException({ status: 422, ...PROBLEMS[rejection](purpose) });
