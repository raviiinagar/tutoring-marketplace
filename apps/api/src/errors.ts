import { HttpException } from "@nestjs/common";
export class ApiProblem extends HttpException {
  constructor(status: number, code: string, message: string, fieldErrors?: Record<string,string[]>) {
    super({ code, message, ...(fieldErrors ? { field_errors: fieldErrors } : {}) }, status);
  }
}

