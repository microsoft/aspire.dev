---
title: 例
description: Aspire の主要な概念を示す、実行可能な完全なサンプルを確認します。
next: false
---

Aspire では柔軟なリソースモデルが提供されており、構造化された方法でリソースを定義および構成できます。このガイドでは、カスタムリソースの例とその実装方法を含め、リソースを追加して構成する一般的なパターンを紹介します。

### 例: 派生コンテナーリソース（Redis）

この例では、`ContainerResource` から派生し、`IResourceWithConnectionString` を実装するカスタムリソース（`RedisResource`）の作成方法を示します。次の内容を扱います:

- データのみを保持するリソースクラスの定義。
- `ReferenceExpression` を使用した遅延評価での `IResourceWithConnectionString` の実装。
- パラメーター検証、パスワード管理、イベント購読、正常性チェック、Fluent API を使ったコンテナー構成を処理する `AddRedis` 拡張メソッドの作成。

```csharp title="C# — RedisResourceExtensions.cs"
public static class RedisResourceExtensions
{
    // この拡張メソッドは、Aspire アプリケーションモデルに Redis リソースを追加するための便利な方法を提供します。
    public static IResourceBuilder<RedisResource> AddRedis(
        this IDistributedApplicationBuilder builder, // メインのアプリケーションビルダーインターフェースを拡張します。
        [ResourceName] string name,                   // この Redis リソースの一意の名前です。
        int? port = null,                             // 省略可能なホストポート マッピングです。
        IResourceBuilder<ParameterResource>? password = null) // パスワード用の省略可能なパラメーターリソースです。
    {
        // 1. 副作用が発生する前に入力を検証します
        // 下流でのエラーを防ぐため、builder と name が null でないことを確認します。
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(name);

        // 2. パスワード ParameterResource を維持または生成します（遅延評価）
        // パスワードパラメーターが指定されていればそれを使い、そうでなければ既定値を作成します。
        // ParameterResource により、実際のパスワード値は後で解決できます（たとえばシークレットから）。
        var passwordParameter = password?.Resource
            ?? ParameterResourceBuilderExtensions.CreateDefaultPasswordParameter(
                builder, $"{name}-password", special: false); // 指定がない場合は既定のパスワードパラメーターを作成します。

        // 3. パスワードパラメーターを持つデータ専用の RedisResource をインスタンス化します
        // RedisResource インスタンスを作成し、名前と（遅延される可能性がある）パスワードパラメーターを渡します。
        var redis = new RedisResource(name, passwordParameter);

        // 実行時に解決された接続文字列を保持するための変数です。
        string? connectionString = null;

        // 4. ConnectionStringAvailableEvent を購読して、実行時に接続文字列を取得します
        // このイベントフックにより、接続文字列が解決された*後*にその値を取得できます
        // Aspire ランタイムにより、割り当てられた可能性のあるポートや解決済みのパラメーター値も含まれます。
        builder.Eventing.Subscribe<ConnectionStringAvailableEvent>(redis, async (@event, ct) =>
        {
            // リソースのメソッドを使って接続文字列を解決します。
            connectionString = await redis.GetConnectionStringAsync(ct).ConfigureAwait(false);
            // 接続文字列が実際に解決されたことを確認します。
            if (connectionString == null)
            {
                throw new DistributedApplicationException(
                    $"Connection string for '{redis.Name}' was unexpectedly null.");
            }
        });

        // 5. 利用可能になった接続文字列を使用する正常性チェックを登録します
        // 正常性チェック用の一意のキーを定義します。
        var healthCheckKey = $"{name}_check";
        // アプリケーションの正常性チェックサービスに Redis 固有の正常性チェックを追加します。
        // ラムダ `_ => connectionString ?? ...` により、正常性チェックでは
        // 上記のイベントハンドラーによって接続文字列が解決された*後*の値を使用します。
        builder.Services
            .AddHealthChecks()
            .AddRedis(_ => connectionString
                                ?? throw new InvalidOperationException("Connection string is unavailable"), // 早すぎるタイミングでアクセスされた場合は例外をスローします。
                        name: healthCheckKey); // 識別のために正常性チェックに名前を付けます。

        // 6. Fluent ビルダーパターンを使ってコンテナーを追加および構成します
        // RedisResource インスタンスをアプリケーションモデルに追加します。
        return builder.AddResource(redis)
                    // 6.a Redis TCP エンドポイントを公開します
                    // ホストポート（指定されていれば）を、コンテナーの既定の Redis ポート（6379）にマップします。
                    // 参照用にエンドポイントへ "tcp" という名前を付けます。
                    .WithEndpoint(
                        port: port,                             // 省略可能なホストポートです。
                        targetPort: 6379,                       // コンテナー内の既定の Redis ポートです。
                        name: RedisResource.PrimaryEndpointName) // RedisResource で定義された定数を使用します。
                    // 6.b コンテナーイメージとタグを指定します
                    // Redis コンテナーに使う Docker イメージを定義します。
                    .WithImage(RedisContainerImageTags.Image, RedisContainerImageTags.Tag)
                    // 6.c 必要であればコンテナーレジストリを構成します
                    // イメージが Docker Hub 上にない場合はコンテナーレジストリを指定します。
                    .WithImageRegistry(RedisContainerImageTags.Registry)
                    // 6.d 正常性チェックをリソースに関連付けます
                    // 先ほど定義した正常性チェックをこのリソースに関連付けます。
                    // Aspire はこれをダッシュボードの状態表示やオーケストレーションで使用します。
                    .WithHealthCheck(healthCheckKey)
                    // 6.e コンテナーのエントリポイントを定義します
                    // 必要に応じて既定のコンテナーエントリポイントを上書きします。ここではシェルを使うように設定しています。
                    .WithEntrypoint("/bin/sh")
                    // 6.f パスワード ParameterResource を環境変数に渡します
                    // コンテナーの環境変数を設定します。ここではコールバックを使って
                    // リソースインスタンス（`redis`）とそのプロパティにアクセスします。
                    .WithEnvironment(context =>
                    {
                        // パスワードパラメーターが存在する場合は、REDIS_PASSWORD 環境変数として公開します。
                        // 実際の値の解決は後で ParameterResource を通じて行われます。
                        if (redis.PasswordParameter is { } pwd)
                        {
                            context.EnvironmentVariables["REDIS_PASSWORD"] = pwd;
                        }
                    })
                    // 6.g 注釈を保持したまま、遅延的にコンテナー引数を構築します
                    // コンテナーのコマンドライン引数を定義します。ここでもコールバックを使うことで
                    // リソースの状態や注釈に応じて動的に引数を構築できます。
                    .WithArgs(context =>
                    {
                        // Redis サーバーを実行するための基本コマンドから開始します。
                        var cmd = new List<string> { "redis-server" };

                        // パスワードパラメーターが設定されている場合は、必要な Redis CLI 引数を追加します。
                        // 注: ここでは前に設定した環境変数名（$REDIS_PASSWORD）を使用します。
                        if (redis.PasswordParameter is not null)
                        {
                            cmd.Add("--requirepass");
                            cmd.Add("$REDIS_PASSWORD"); // 環境変数を参照します。
                        }

                        // PersistenceAnnotation がリソースに追加されているか確認します。
                        // 注釈を使うと、省略可能な構成や動作を追加できます。
                        if (redis.TryGetLastAnnotation<PersistenceAnnotation>(out var pa))
                        {
                            // 永続化が構成されている場合は、対応する Redis CLI 引数を追加します。
                            var interval = (pa.Interval ?? TimeSpan.FromSeconds(60))
                                .TotalSeconds
                                .ToString(CultureInfo.InvariantCulture);
                            cmd.Add("--save");
                            cmd.Add(interval); // 保存間隔（秒）です。
                            cmd.Add(pa.KeysChangedThreshold.ToString(CultureInfo.InvariantCulture)); // キー変更数のしきい値です。
                        }

                        // シェルエントリポイント用の引数を最終化します。
                        context.Args.Add("-c"); // コマンド文字列を実行するための /bin/sh への引数です。
                        context.Args.Add(string.Join(' ', cmd)); // すべての要素を 1 つのコマンド文字列に結合します。
                        return Task.CompletedTask; // このコールバックは同期的であるため、完了済みタスクを返します。
                    });
    }
}
```

```csharp title="C# — RedisResource.cs"
// .NET Foundation は 1 つ以上の契約に基づいてこのコードをライセンスしています。
// .NET Foundation は MIT ライセンスの下でこのファイルをあなたにライセンスします。

namespace Aspire.Hosting.ApplicationModel;

// ContainerResource から派生した、データのみを保持する Redis リソースです。
// 接続の詳細を提供するために IResourceWithConnectionString を実装します。
public class RedisResource(string name)
    // ContainerResource から共通のコンテナープロパティと動作を継承します。
    : ContainerResource(name),
    // 接続文字列を提供できることを示すためにこのインターフェースを実装します。
    IResourceWithConnectionString
{
    // 一貫性を保つために使用する、プライマリエンドポイント名の定数です。
    internal const string PrimaryEndpointName = "tcp";

    // 遅延初期化されるプライマリエンドポイント参照のバッキングフィールドです。
    private EndpointReference? _primaryEndpoint;

    // プライマリの "tcp" エンドポイントに対する EndpointReference を取得する公開プロパティです。
    // EndpointReference により、エンドポイント詳細（ホスト、ポート、URL）へ遅延アクセスできます。
    // 最初のアクセス時に遅延初期化されます。
    public EndpointReference PrimaryEndpoint
        => _primaryEndpoint ??= new(this, PrimaryEndpointName);

    // Redis パスワードを表す ParameterResource を保持するプロパティです。
    // ParameterResource により、パスワード値は後で解決できます（たとえばシークレットから）。
    public ParameterResource? PasswordParameter { get; private set; }

    // パスワード ParameterResource を受け取るコンストラクターです。
    public RedisResource(string name, ParameterResource password)
        : this(name) // 基本コンストラクターを呼び出します。
    {
        PasswordParameter = password; // 指定されたパスワードパラメーターを保持します。
    }

    // 接続文字列用の ReferenceExpression を構築するヘルパーメソッドです。
    // ReferenceExpression は、接続文字列の構造を
    // エンドポイントやパラメーターへの参照を含めて保持し、遅延解決を可能にします。
    private ReferenceExpression BuildConnectionString()
    {
        // ビルダーを使って式を少しずつ組み立てます。
        var builder = new ReferenceExpressionBuilder();
        // PrimaryEndpoint のプロパティを参照して、ホストとポートの部分を追加します。
        // .Property() により、run モードと publish モードの両方に適した遅延解決が保証されます。
        builder.Append($"{PrimaryEndpoint.Property(EndpointProperty.HostAndPort)}");
        // パスワードパラメーターが存在する場合は、それを接続文字列の形式に追加します。
        if (PasswordParameter is not null)
        {
            // パスワードパラメーターを直接追加します。ReferenceExpression がその遅延解決を処理します。
            builder.Append($",password={PasswordParameter}");
        }
        // 最終的な ReferenceExpression を構築して返します。
        return builder.Build();
    }

    // IResourceWithConnectionString.ConnectionStringExpression の実装です。
    // publish モード向けに、接続文字列を ReferenceExpression として提供します
    // この時点ではまだ具体的な値を利用できません。
    public ReferenceExpression ConnectionStringExpression =>
        BuildConnectionString();
}
```

### 例: カスタムリソース - Talking Clock

この例では、組み込み型から派生しない完全なカスタムリソース（`TalkingClockResource`）の作成方法を示します。次の内容を扱います:

- シンプルなリソースクラスの定義。
- リソースの動作（開始、ログ出力、状態更新）を管理するカスタムイベント購読者（`TalkingClockEventingSubscriber`）の実装。
- リソース単位のロギングに `ResourceLoggerService` を使用する方法。
- 状態更新の発行に `ResourceNotificationService` を使用する方法。
- リソースとそのイベント購読者を登録する `AddTalkingClock` 拡張メソッドの作成。

```csharp title="C# — TalkingClockResource.cs"
// カスタムリソース型を定義します。これは Aspire の基本 `Resource` クラスから継承します。
// このクラスは主にデータコンテナーであり、Aspire の動作はイベント購読者と拡張メソッドによって追加されます。
public sealed class TalkingClockResource(string name) : Resource(name);
```

```csharp title="C# — TalkingClockEventingSubscriber.cs"
// TalkingClockResource の動作を実装する Aspire イベント購読者を定義します。
// イベント購読者を使うと、アプリケーションの起動イベントとライフサイクルイベントに接続できます。
public sealed class TalkingClockEventingSubscriber(
    // リソースの状態更新（例: Running、Starting）を発行するための Aspire サービスです。
    ResourceNotificationService notification,
    // 特定のリソースにスコープされたロガーを取得するための Aspire サービスです。
    ResourceLoggerService loggerSvc,
    // 必要に応じて依存性の注入に使用できる汎用サービスプロバイダーです。
    IServiceProvider services) : IDistributedApplicationEventingSubscriber // Aspire イベント購読者インターフェースを実装します。
{
    // このメソッドは、ライフサイクルイベントを購読できるようにするために Aspire から呼び出されます。
    public Task SubscribeAsync(
        IDistributedApplicationEventing eventing,         // 購読対象のイベントサービスです。
        DistributedApplicationExecutionContext context,   // モデルや環境情報を含む実行コンテキストです。
        CancellationToken cancellationToken)              // 正常終了のためのキャンセレーショントークンです。
    {
        // AfterResourcesCreatedEvent を購読して、クロックの動作を開始します。
        eventing.Subscribe<AfterResourcesCreatedEvent>(async (@event, ct) =>
        {
            // Aspire アプリケーションモデル内の TalkingClockResource インスタンスをすべて探します。
            foreach (var clock in context.Model.Resources.OfType<TalkingClockResource>())
            {
                // このクロックインスタンス専用の Aspire ロガーを取得します。
                // ログはダッシュボード内でこのリソースに関連付けられます。
                var log = loggerSvc.GetLogger(clock);

                // クロックのライフサイクルと動作を管理するバックグラウンドタスクを開始します。
                _ = Task.Run(async () =>
                {
                    // このリソースがこれから開始されることを示す Aspire イベントを発行します。
                    // 他のコンポーネントは、このイベントを購読して開始前の処理を行えます。
                    await eventing.PublishAsync(
                        new BeforeResourceStartedEvent(clock, services), ct);

                    // リソースに関連付けられた情報ログメッセージを出力します。
                    log.LogInformation("Starting Talking Clock...");

                    // Aspire 通知サービスに初期状態の更新を発行します。
                    // これにより、リソースの状態が 'Running' に設定され、開始時刻が記録されます。
                    // Aspire ダッシュボードや他のオーケストレーターはこれらの状態更新を監視します。
                    await notification.PublishUpdateAsync(clock, s => s with
                    {
                        StartTimeStamp = DateTime.UtcNow,
                        State          = KnownResourceStates.Running // Aspire の既知の状態を使用します。
                    });

                    // キャンセルが要求されない限り実行されるメインループに入ります。
                    while (!ct.IsCancellationRequested)
                    {
                        // このリソースに関連付けて現在時刻をログ出力します。
                        log.LogInformation("The time is {time}", DateTime.UtcNow);

                        // ResourceStateSnapshot を使ってカスタム状態更新 "Tick" を発行します。
                        // これは Aspire ダッシュボードでカスタム状態文字列とスタイルを使う方法を示しています。
                        await notification.PublishUpdateAsync(clock,
                            s => s with { State = new ResourceStateSnapshot("Tick", KnownResourceStateStyles.Info) });

                        await Task.Delay(1000, ct);

                        // ResourceStateSnapshot を使って、別のカスタム状態更新 "Tock" を発行します。
                        await notification.PublishUpdateAsync(clock,
                            s => s with { State = new ResourceStateSnapshot("Tock", KnownResourceStateStyles.Success) });

                        await Task.Delay(1000, ct);
                    }
                }, ct);
            }
        });

        return Task.CompletedTask;
    }
}
```

```csharp title="C# — TalkingClockExtensions.cs"

// TalkingClockResource をアプリケーションビルダーに追加するための Aspire 拡張メソッドを定義します。
// これにより、ユーザーはカスタムリソースを追加するための Fluent API を利用できます。
public static class TalkingClockExtensions
{
    // TalkingClockResource を追加するためのメインの Aspire 拡張メソッドです。
    public static IResourceBuilder<TalkingClockResource> AddTalkingClock(
        this IDistributedApplicationBuilder builder, // Aspire アプリケーションビルダーを拡張します。
        string name)                                  // このリソースインスタンスの名前です。
    {
        // Aspire のヘルパーメソッドを使って、TalkingClockEventingSubscriber を DI コンテナーに登録します。
        // Aspire ホスティング基盤は、登録されたイベント購読者を自動的に検出して実行します。
        builder.Services.TryAddEventingSubscriber<TalkingClockEventingSubscriber>();

        // TalkingClockResource の新しいインスタンスを作成します。
        var clockResource = new TalkingClockResource(name);

        // リソースインスタンスを Aspire アプリケーションビルダーに追加し、Fluent API を使って構成します。
        return builder.AddResource(clockResource)
            // Aspire の ExcludeFromManifest を使って、このリソースがデプロイマニフェストに含まれないようにします。
            .ExcludeFromManifest()
            // Aspire の WithInitialState を使って、このリソースの初期状態スナップショットを設定します。
            // これにより、Aspire ダッシュボードで確認できる初期メタデータが提供されます。
            .WithInitialState(new CustomResourceSnapshot // カスタムリソース状態向けの Aspire 型です。
            {
                ResourceType      = "TalkingClock", // Aspire に対してリソースの種類を識別する文字列です。
                CreationTimeStamp = DateTime.UtcNow,
                State             = KnownResourceStates.NotStarted, // Aspire の既知の状態を使用します。
                // Aspire ダッシュボードのリソース詳細に表示されるカスタムプロパティを追加します。
                Properties =
                [
                    // ソース情報には Aspire の既知のプロパティキーを使用します。
                    new(CustomResourceKnownProperties.Source, "Talking Clock")
                ],
                // Aspire ダッシュボードでリンクとして表示される、このリソースに関連付けられた URL を追加します。
                Urls =
                [
                    // Aspire の UrlSnapshot 型を使って URL を定義します。
                    new("Speaking Clock", "https://www.speaking-clock.com/", isInternal: false)
                ]
            });
    }
}
```
