using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class AtsTransformerHelperTests
{
    [Fact]
    public void StripAssemblyPrefix_RemovesAssemblyMetadataFromGenericArguments()
    {
        var typeId = "Test.Assembly/System.Collections.Generic.IReadOnlyList`1[[Contoso.Widget, Contoso.Assembly, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]";

        var stripped = AtsTransformer.StripAssemblyPrefix(typeId);

        Assert.Equal("System.Collections.Generic.IReadOnlyList`1[[Contoso.Widget]]", stripped);
    }

    [Fact]
    public void FormatTypeRef_FormatsArrayTypes()
    {
        var typeRef = new AtsDumpTypeRef
        {
            TypeId = "string",
            Category = "Array",
            ElementType = new AtsDumpTypeRef
            {
                TypeId = "string",
                Category = "Primitive",
            },
        };

        var formatted = AtsTransformer.FormatTypeRef(typeRef);

        Assert.Equal("string[]", formatted);
    }
}
