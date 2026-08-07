using AtsJsonGenerator;

var rootCommand = GenerateCommand.GetCommand();
rootCommand.Add(BatchGenerateCommand.GetCommand());

return await rootCommand.Parse(args).InvokeAsync().ConfigureAwait(false);
