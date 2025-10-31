import { UserService } from '../../domain/services/UserService';
import { WalletService } from '../../../finance/domain/services/WalletService';
import { ICreateUserDTO, IUserResponseDTO } from '../../types/user.types';

export class RegisterUser {
  constructor(
    private userService: UserService,
    private walletService: WalletService,
  ) {}

  async execute(input: ICreateUserDTO): Promise<IUserResponseDTO> {
    const user = await this.userService.registerUser(input);
    const wallet = await this.walletService.createWallet({
      userId: user.id,
      currency: input.currency || 'BRL',
    });

    return { 
      user: user.toDTO(),
      wallet: wallet.toDTO(),
    };
  }
}
