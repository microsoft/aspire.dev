#[path = ".aspire/modules/mod.rs"]
mod aspire;

use aspire::*;
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let builder = create_builder(None)?;

    builder.add_external_service(
        "web",
        Value::String("https://aspire.dev".to_string()),
    )?;

    let app = builder.build()?;
    app.run(None)?;
    Ok(())
}
