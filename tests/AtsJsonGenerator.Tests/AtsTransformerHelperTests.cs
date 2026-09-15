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
    public void StripAssemblyPrefix_PreservesEveryGenericArgument()
    {
        var typeId = "Test.Assembly/Contoso.Pair`2[[Contoso.Widget, Contoso.Assembly, Version=1.0.0.0],[Contoso.Gadget, Contoso.Assembly, Version=1.0.0.0]]";

        var stripped = AtsTransformer.StripAssemblyPrefix(typeId);

        Assert.Equal("Contoso.Pair`2[[Contoso.Widget],[Contoso.Gadget]]", stripped);
    }

    [Fact]
    public void StripAssemblyPrefix_CleansNestedGenericArguments()
    {
        var typeId = "Test.Assembly/Contoso.Pair`2[[Contoso.Widget, Contoso.Assembly],[System.Collections.Generic.IReadOnlyList`1[[Contoso.Gadget, Contoso.Assembly]], System.Collections]]";

        var stripped = AtsTransformer.StripAssemblyPrefix(typeId);

        Assert.Equal(
            "Contoso.Pair`2[[Contoso.Widget],[System.Collections.Generic.IReadOnlyList`1[[Contoso.Gadget]]]]",
            stripped);
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

    [Fact]
    public void FormatTypeRef_FormatsMultiArgumentReflectionGenerics()
    {
        var typeRef = new AtsDumpTypeRef
        {
            TypeId = "System.Private.CoreLib/System.Collections.Generic.KeyValuePair`2[[System.String, System.Private.CoreLib],[System.String, System.Private.CoreLib]][]",
            Category = "Unknown",
        };

        var formatted = AtsTransformer.FormatTypeRef(typeRef);

        Assert.Equal("KeyValuePair<string,string>[]", formatted);
    }

    [Fact]
    public void FormatTypeRef_FormatsNestedReflectionGenerics()
    {
        var typeRef = new AtsDumpTypeRef
        {
            TypeId = "Test.Assembly/Contoso.Pair`2[[Contoso.Widget, Contoso.Assembly],[System.Collections.Generic.IReadOnlyList`1[[Contoso.Gadget, Contoso.Assembly]], System.Collections]]",
            Category = "Unknown",
        };

        var formatted = AtsTransformer.FormatTypeRef(typeRef);

        Assert.Equal("Pair<Widget,IReadOnlyList<Gadget>>", formatted);
    }

    [Fact]
    public void FormatTypeRef_FormatsArrayGenericArguments()
    {
        var typeRef = new AtsDumpTypeRef
        {
            TypeId = "System.Private.CoreLib/System.Collections.Generic.IReadOnlyList`1[[System.String[], System.Private.CoreLib]]",
            Category = "Unknown",
        };

        var formatted = AtsTransformer.FormatTypeRef(typeRef);

        Assert.Equal("IReadOnlyList<string[]>", formatted);
    }
}
