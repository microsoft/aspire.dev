using AtsJsonGenerator;

var rootCommand = GenerateCommand.GetCommand();
rootCommand.Add(BatchGenerateCommand.GetCommand());
rootCommand.Add(SupportMatrixCommand.GetCommand());

return await rootCommand.Parse(args).InvokeAsync().ConfigureAwait(false);
