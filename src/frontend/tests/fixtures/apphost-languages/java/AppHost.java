import aspire.*;

void main(String[] args) throws Exception {
    var builder = DistributedApplication.CreateBuilder(args);

    var web = builder.addExecutable(
        "web",
        "node",
        ".",
        new String[] { "service.mjs" });
    web.withHttpEndpoint(new WithHttpEndpointOptions().env("PORT"));
    web.withExternalHttpEndpoints();

    builder.build().run();
}
