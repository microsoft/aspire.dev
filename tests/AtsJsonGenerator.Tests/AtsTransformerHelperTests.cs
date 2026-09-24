using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class AtsTransformerHelperTests
{
    [Fact]
    public void Transform_RejectsDumpContainingErrorDiagnostics()
    {
        var dump = new AtsDumpRoot
        {
            Diagnostics = [new() { Severity = "Error", Message = "Duplicate capability 'addTo'." }],
        };

        var error = Assert.Throws<InvalidOperationException>(() =>
            AtsTransformer.Transform(dump, "Example.Package"));
        Assert.Contains("Duplicate capability", error.Message);
    }

    [Fact]
    public void FormatTypeRef_PreservesUnionMembersAndArrayPrecedence()
    {
        var union = new AtsDumpTypeRef
        {
            TypeId = "Runtime/Example.BicepValueProxy|enum:Example.StorageSkuName",
            Category = "Union",
            UnionTypes =
            [
                new() { TypeId = "Runtime/Example.BicepValueProxy", Category = "Handle" },
                new() { TypeId = "enum:Example.StorageSkuName", Category = "Enum" },
            ],
        };

        Assert.Equal("BicepValueProxy | StorageSkuName", AtsTransformer.FormatTypeRef(union));
        Assert.Equal("(BicepValueProxy | StorageSkuName)[]", AtsTransformer.FormatTypeRef(
            new AtsDumpTypeRef { TypeId = "union[]", Category = "Array", ElementType = union }));
    }

    [Fact]
    public void FormatTypeRef_RejectsUnionWithoutMemberMetadata()
    {
        Assert.Throws<InvalidOperationException>(() => AtsTransformer.FormatTypeRef(
            new AtsDumpTypeRef { TypeId = "string|number", Category = "Union" }));
    }

    [Fact]
    public void FormatTypeRef_UsesCanonicalEnumNames()
    {
        var type = new AtsDumpTypeRef
        {
            TypeId = "enum:Azure.Provisioning.Network.ProtocolType",
            Category = "Enum",
        };
        var names = new Dictionary<string, string> { [type.TypeId] = "NetworkProtocolType" };

        Assert.Equal("NetworkProtocolType", AtsTransformer.FormatTypeRef(type, names));
    }

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
