namespace AtsJsonGenerator.Helpers;

/// <summary>
/// The <c>Category</c> values the dump emits for an <see cref="AtsDumpTypeRef"/>. They are the names of
/// <c>AtsTypeCategory</c> in Aspire.TypeSystem, serialized as strings.
/// </summary>
internal static class AtsTypeCategories
{
    public const string Primitive = "Primitive";
    public const string Enum = "Enum";
    public const string Handle = "Handle";
    public const string Dto = "Dto";
    public const string Callback = "Callback";
    public const string Array = "Array";
    public const string List = "List";
    public const string Dict = "Dict";
    public const string Union = "Union";
}
