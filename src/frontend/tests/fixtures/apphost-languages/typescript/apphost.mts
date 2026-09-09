import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

await builder
  .addExecutable('web', 'node', '.', ['service.mjs'])
  .withHttpEndpoint({ env: 'PORT' })
  .withExternalHttpEndpoints();

await builder.build().run();
