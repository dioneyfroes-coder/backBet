import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ContactDTO, ContactDTOType } from '../dtos/ContactDTOs';
import { CreateContactMessage } from '@/core/contact/application/use-cases/CreateContactMessage';

export class ContactController extends BaseController {
  constructor(private createContactUseCase: CreateContactMessage) {
    super();
  }

  /**
   * @openapi
   * /contact:
   *   post:
   *     tags:
   *       - Contact
   *     summary: Send contact message
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ContactRequest'
   *     responses:
   *       '202':
   *         description: Message accepted for delivery
   */
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const payload = this.validateSchema(ContactDTO, req.body) as ContactDTOType;

      const result = await this.createContactUseCase.execute(payload);
      return this.ok(res, { message: 'Mensagem recebida', ticketId: result.ticketId }, 202);
    } catch (err) {
      return this.handleError(err, res);
    }
  }
}
