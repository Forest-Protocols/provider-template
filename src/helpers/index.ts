import { PipeError, PipeResponseCode } from "@forest-protocols/sdk";
import { z } from "zod";
/**
 * Validates the request body according to the given Zod schema.
 */
export const validateBody = <T>(body: any, schema: z.Schema<T>) => {
  const bodyValidation = schema.safeParse(body);
  if (bodyValidation.error) {
    throw new PipeError(PipeResponseCode.BAD_REQUEST, {
      message: "Validation error",
      body: bodyValidation.error.issues,
    });
  }

  return bodyValidation.data;
};
