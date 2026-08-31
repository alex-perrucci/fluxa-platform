import { HttpException } from '@nestjs/common';
import { AdeAuthController } from './ade-auth.controller';
import { AdeAuthService } from './ade-auth.service';

describe('AdeAuthController', () => {
  function createController() {
    const refresh = jest.fn().mockResolvedValue({
      status: 'SESSION_READY',
      finalUrl: 'https://example.test',
      sessionSaved: true,
    });
    const status = jest.fn().mockReturnValue({
      status: 'IDLE',
      updatedAt: new Date(0).toISOString(),
    });
    const auth = { refresh, status } as unknown as AdeAuthService;
    return { controller: new AdeAuthController(auth), refresh };
  }

  it('forwards a normalized fiscalId to the auth service', async () => {
    const { controller, refresh } = createController();

    await controller.refresh({ fiscalId: ' 03053300343 ' });

    expect(refresh).toHaveBeenCalledWith('03053300343');
  });

  it('keeps the legacy default refresh when fiscalId is omitted', async () => {
    const { controller, refresh } = createController();

    await controller.refresh();

    expect(refresh).toHaveBeenCalledWith(undefined);
  });

  it('rejects an invalid fiscalId before authentication starts', async () => {
    const { controller, refresh } = createController();

    try {
      await controller.refresh({ fiscalId: 'invalid' });
      throw new Error('Expected refresh to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'ADE_FISCAL_ID_INVALID',
      });
    }

    expect(refresh).not.toHaveBeenCalled();
  });
});
