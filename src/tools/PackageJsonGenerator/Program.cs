using PackageJsonGenerator;

#if LAUNCH_DEBUGGER
if (!System.Diagnostics.Debugger.IsAttached)
{
    System.Diagnostics.Debugger.Launch();
}
#endif

var rootCommand = RootGenerateCommand.GetCommand();
rootCommand.Add(BatchGenerateCommand.GetCommand());

return await rootCommand.Parse(args).InvokeAsync().ConfigureAwait(false);