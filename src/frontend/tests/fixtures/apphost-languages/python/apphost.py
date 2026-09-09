from aspire_app import create_builder

with create_builder() as builder:
    (
        builder.add_executable("web", "node", ".", ["service.mjs"])
        .with_http_endpoint(env="PORT")
        .with_external_http_endpoints()
    )

    builder.run()
