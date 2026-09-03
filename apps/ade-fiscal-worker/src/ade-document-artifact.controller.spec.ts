import { HttpException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AdeDcoHttpClient } from './ade-dco-http.client';
import { AdeDocumentArtifactController } from './ade-document-artifact.controller';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

function controllerFixture() {
  const getOfficialArtifact = jest.fn().mockResolvedValue({
    status: 200,
    contentType: 'application/pdf',
    bytes: Buffer.from('%PDF-test'),
  });
  const storageStatePathForUse = jest
    .fn()
    .mockReturnValue('/runtime/03053300343.json');
  const read = jest.fn().mockReturnValue({ navigationTimeoutMs: 5_000 });

  const controller = new AdeDocumentArtifactController(
    { getOfficialArtifact } as unknown as AdeDcoHttpClient,
    { storageStatePathForUse } as unknown as AdeSessionService,
    { read } as unknown as AdeRuntimeConfigService,
  );

  const setHeader = jest.fn();
  const response = { setHeader } as unknown as Response;

  return {
    controller,
    getOfficialArtifact,
    storageStatePathForUse,
    setHeader,
    response,
  };
}

describe('AdeDocumentArtifactController', () => {
  it('returns the official PDF for the requested incaricante and idtrx', async () => {
    const fixture = controllerFixture();

    const result = await fixture.controller.download(
      '03053300343',
      '233367613',
      fixture.response,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(fixture.storageStatePathForUse).toHaveBeenCalledWith('03053300343');
    expect(fixture.getOfficialArtifact).toHaveBeenCalledWith({
      storageStatePath: '/runtime/03053300343.json',
      externalId: '233367613',
      timeoutMs: 5_000,
    });
    expect(fixture.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(fixture.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });

  it('rejects malformed fiscal IDs before touching the AdE session', async () => {
    const fixture = controllerFixture();

    await expect(
      fixture.controller.download('bad', '233367613', fixture.response),
    ).rejects.toMatchObject<HttpException>({
      status: 400,
    });

    expect(fixture.storageStatePathForUse).not.toHaveBeenCalled();
    expect(fixture.getOfficialArtifact).not.toHaveBeenCalled();
  });
});
