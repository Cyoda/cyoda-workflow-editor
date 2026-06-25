import { z } from "zod";

export const NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Maximum length cyoda-go v0.8.0 enforces on workflow/state/transition/processor names. */
export const NAME_MAX_LENGTH = 256;

export const NameSchema = z
  .string()
  .regex(NAME_REGEX, "Invalid name: must start with a letter and contain only letters, digits, _ or -")
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`);
