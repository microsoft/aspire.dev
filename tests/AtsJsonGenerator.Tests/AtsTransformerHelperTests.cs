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

    internal const string KustoInheritedDuplicate =
        "Duplicate capability 'Aspire.Hosting.Azure.Provisioning.Kusto.Generated/KustoDataConnectionProxy.addTo': " +
        "defined at 'Aspire.Hosting.Azure.Provisioning.Kusto.Generated.KustoCosmosDBDataConnectionProxy.AddTo' and " +
        "'Aspire.Hosting.Azure.Provisioning.Kusto.Generated.KustoEventGridDataConnectionProxy.AddTo'. " +
        "Remove [AspireExport] from one of them or use different capability IDs.";

    internal const string NetworkInheritedDuplicate =
        "Duplicate capability 'Aspire.Hosting.Azure.Provisioning.Network.Generated/BaseAdminRuleProxy.addTo': " +
        "defined at 'Aspire.Hosting.Azure.Provisioning.Network.Generated.BaseAdminRuleProxy.AddTo' and " +
        "'Aspire.Hosting.Azure.Provisioning.Network.Generated.NetworkAdminRuleProxy.AddTo'. " +
        "Remove [AspireExport] from one of them or use different capability IDs.";

    private const string ContosoDuplicate =
        "Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and " +
        "'Contoso.Generated.BarProxy.AddTo'. Remove [AspireExport] from one of them or use different capability IDs.";

    private const string KustoNamespace = "Aspire.Hosting.Azure.Provisioning.Kusto.Generated";
    private const string NetworkNamespace = "Aspire.Hosting.Azure.Provisioning.Network.Generated";
    private const string ProvisionableResourceProxy = "Aspire.Hosting.Azure.Provisioning.ProvisionableResourceProxy";

    /// <summary>
    /// Handle types that mirror the proxy hierarchies in the affected Kusto and Network dumps.
    /// </summary>
    internal static List<AtsDumpHandleType> KnownProxyHandleTypes =>
    [
        CreateHandleType($"{KustoNamespace}.KustoDataConnectionProxy", ProvisionableResourceProxy),
        CreateHandleType($"{KustoNamespace}.KustoCosmosDBDataConnectionProxy", $"{KustoNamespace}.KustoDataConnectionProxy", ProvisionableResourceProxy),
        CreateHandleType($"{KustoNamespace}.KustoEventGridDataConnectionProxy", $"{KustoNamespace}.KustoDataConnectionProxy", ProvisionableResourceProxy),
        CreateHandleType($"{NetworkNamespace}.BaseAdminRuleProxy", ProvisionableResourceProxy),
        CreateHandleType($"{NetworkNamespace}.NetworkAdminRuleProxy", $"{NetworkNamespace}.BaseAdminRuleProxy", ProvisionableResourceProxy),
    ];

    [Theory]
    // Two derived types inherit the member from the capability's type.
    [InlineData(KustoInheritedDuplicate)]
    // The capability's type and a derived type both define the member.
    [InlineData(NetworkInheritedDuplicate)]
    public void IsInheritedDuplicateCapability_MatchesScannerDefectDiagnostics(string message)
    {
        Assert.True(KnownScannerDiagnostics.IsInheritedDuplicateCapability(
            message, new AtsDumpRoot { HandleTypes = KnownProxyHandleTypes }));
    }

    [Fact]
    public void IsInheritedDuplicateCapability_MatchesDefinitionsDerivedFromCapabilityType()
    {
        var dump = CreateDump(
            CreateHandleType("Contoso.Generated.FooProxy", "Contoso.Generated.BaseProxy"),
            CreateHandleType("Contoso.Generated.BarProxy", "Contoso.Generated.IntermediateProxy", "Contoso.Generated.BaseProxy"));

        Assert.True(KnownScannerDiagnostics.IsInheritedDuplicateCapability(ContosoDuplicate, dump));
    }

    [Theory]
    // Unrelated types that share the capability ID are a genuine collision.
    [InlineData("Contoso.Generated.OtherProxy", "Contoso.Generated.OtherProxy")]
    // Only one definition derives from the capability's type.
    [InlineData("Contoso.Generated.BaseProxy", "Contoso.Generated.OtherProxy")]
    [InlineData("Contoso.Generated.OtherProxy", "Contoso.Generated.BaseProxy")]
    public void IsInheritedDuplicateCapability_RejectsDefinitionsNotDerivedFromCapabilityType(string fooBaseType, string barBaseType)
    {
        var dump = CreateDump(
            CreateHandleType("Contoso.Generated.FooProxy", fooBaseType),
            CreateHandleType("Contoso.Generated.BarProxy", barBaseType));

        Assert.False(KnownScannerDiagnostics.IsInheritedDuplicateCapability(ContosoDuplicate, dump));
    }

    [Fact]
    public void IsInheritedDuplicateCapability_RejectsDefinitionsMissingFromHandleTypes()
    {
        var dump = CreateDump(CreateHandleType("Contoso.Generated.FooProxy", "Contoso.Generated.BaseProxy"));

        Assert.False(KnownScannerDiagnostics.IsInheritedDuplicateCapability(ContosoDuplicate, dump));
    }

    [Theory]
    // Extension-method capability IDs have no owning type segment.
    [InlineData("Duplicate capability 'Aspire.Hosting.Redis/addRedis': defined at 'Aspire.Hosting.RedisBuilderExtensions.AddRedis' and 'Aspire.Hosting.OtherBuilderExtensions.AddRedis'. Remove [AspireExport] from one of them or use different capability IDs.")]
    // Both definitions come from the same type.
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Contoso.Generated.FooProxy.AddTo'. Remove [AspireExport] from one of them or use different capability IDs.")]
    // A definition lives outside the capability's namespace.
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Fabrikam.Generated.BarProxy.AddTo'. Remove [AspireExport] from one of them or use different capability IDs.")]
    // The definitions are different members.
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Contoso.Generated.BarProxy.RemoveFrom'. Remove [AspireExport] from one of them or use different capability IDs.")]
    // The definitions do not implement the capability's method.
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.Remove' and 'Contoso.Generated.BarProxy.Remove'. Remove [AspireExport] from one of them or use different capability IDs.")]
    // The scanner's remediation sentence is missing or altered.
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Contoso.Generated.BarProxy.AddTo'.")]
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Contoso.Generated.BarProxy.AddTo'. Remove [AspireExport] from one of them.")]
    [InlineData("Duplicate capability 'Contoso.Generated/BaseProxy.addTo': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Contoso.Generated.BarProxy.AddTo'. Remove [AspireExport] from one of them or use different capability IDs.\n")]
    [InlineData("Duplicate type 'Contoso.Generated/BaseProxy': defined at 'Contoso.Generated.FooProxy.AddTo' and 'Contoso.Generated.BarProxy.AddTo'. Remove [AspireExport] from one of them or use different capability IDs.")]
    [InlineData("")]
    public void IsInheritedDuplicateCapability_RejectsOtherDiagnostics(string message)
    {
        // The Contoso definitions derive from the capability's type, so only the message shape is rejected.
        var dump = CreateDump(
            CreateHandleType("Contoso.Generated.FooProxy", "Contoso.Generated.BaseProxy"),
            CreateHandleType("Contoso.Generated.BarProxy", "Contoso.Generated.BaseProxy"),
            CreateHandleType("Fabrikam.Generated.BarProxy", "Contoso.Generated.BaseProxy"));

        Assert.False(KnownScannerDiagnostics.IsInheritedDuplicateCapability(message, dump));
    }

    [Fact]
    public void Transform_ToleratesKnownScannerDiagnosticsOnlyWhenRequested()
    {
        var dump = new AtsDumpRoot
        {
            HandleTypes = KnownProxyHandleTypes,
            Diagnostics =
            [
                new() { Severity = "Error", Message = KustoInheritedDuplicate },
                new() { Severity = "Error", Message = NetworkInheritedDuplicate },
            ],
        };

        var error = Assert.Throws<InvalidOperationException>(() =>
            AtsTransformer.Transform(dump, "Example.Package"));
        Assert.Contains(KustoInheritedDuplicate, error.Message);

        var model = AtsTransformer.Transform(dump, "Example.Package", tolerateKnownScannerDiagnostics: true);
        Assert.Equal("Example.Package", model.Package.Name);
        Assert.Equal([KustoInheritedDuplicate, NetworkInheritedDuplicate], KnownScannerDiagnostics.GetToleratedErrors(dump));
    }

    [Fact]
    public void Transform_ReportsOnlyUnexpectedErrorsWhenToleratingKnownScannerDiagnostics()
    {
        const string unexpected = "Duplicate capability 'Contoso/addThing': defined at 'Contoso.A.AddThing' and 'Contoso.B.AddThing'. Remove [AspireExport] from one of them or use different capability IDs.";
        var dump = new AtsDumpRoot
        {
            // ContosoDuplicate has the defect's message shape, but its definitions aren't handle types in this dump.
            HandleTypes = KnownProxyHandleTypes,
            Diagnostics =
            [
                new() { Severity = "Error", Message = KustoInheritedDuplicate },
                new() { Severity = "Error", Message = unexpected },
                new() { Severity = "Error", Message = ContosoDuplicate },
                new() { Severity = "Warning", Message = "Ignored warning." },
            ],
        };

        var error = Assert.Throws<InvalidOperationException>(() =>
            AtsTransformer.Transform(dump, "Example.Package", tolerateKnownScannerDiagnostics: true));
        Assert.Equal($"ATS dump contains error diagnostics: {unexpected}; {ContosoDuplicate}", error.Message);
        Assert.Equal([KustoInheritedDuplicate], KnownScannerDiagnostics.GetToleratedErrors(dump));
    }

    private static AtsDumpRoot CreateDump(params AtsDumpHandleType[] handleTypes) => new() { HandleTypes = [.. handleTypes] };

    // Dump type IDs are prefixed with their assembly name.
    private static AtsDumpHandleType CreateHandleType(string typeName, params string[] baseTypeNames) => new()
    {
        AtsTypeId = $"Example.Assembly/{typeName}",
        BaseTypeHierarchy =
        [
            .. baseTypeNames.Select(baseTypeName => new AtsDumpTypeRef
            {
                TypeId = $"Example.Assembly/{baseTypeName}",
                Category = "Handle",
            }),
        ],
    };

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
