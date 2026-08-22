import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Valida o corpo/params da requisição contra um schema Zod.
 * Em falha, devolve 400 com a lista de erros — sem deixar passar nada
 * malformado para os services. Validação no backend é OBRIGATÓRIA:
 * a do frontend é só conveniência e pode ser burlada.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      );
    }
    return result.data;
  }
}
