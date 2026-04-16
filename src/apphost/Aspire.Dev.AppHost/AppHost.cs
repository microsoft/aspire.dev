#pragma warning disable AZPROVISION001 // Azure.Provisioning.FrontDoor types are experimental

using Azure.Provisioning.Cdn;
using Azure.Provisioning.Expressions;
using Azure.Provisioning.FrontDoor;

var builder = DistributedApplication.CreateBuilder(args);

var staticHostWebsite = builder.AddProject<Projects.StaticHost>("aspiredev")
    .WithExternalHttpEndpoints();

if (builder.ExecutionContext.IsRunMode)
{
    // For local development: Use ViteApp for hot reload and development experience
    builder.AddViteApp("frontend", "../../frontend")
           .WithPnpm()
           .WithUrlForEndpoint("http", static url => url.DisplayText = "aspire.dev (Local)")
           .WithExternalHttpEndpoints();
}
else
{
    // For deployment: We want to pick AppService as the environment to publish to.
    var appService = builder.AddAzureAppServiceEnvironment("production");

    builder.AddAzureFrontDoor("frontDoorProfile")
        .WithOrigin(staticHostWebsite)
        .ConfigureInfrastructure(infra =>
        {
            var resources = infra.GetProvisionableResources();
            var uniqueStr = BicepFunction.GetUniqueString(BicepFunction.GetResourceGroup().Id);

            // Upgrade to Premium SKU (required for WAF)
            var profile = resources.OfType<CdnProfile>().Single();
            profile.SkuName = CdnSkuName.PremiumAzureFrontDoor;
            profile.Name = BicepFunction.Take(BicepFunction.Interpolate($"frontdoor{uniqueStr}"), 50);

            // Configure endpoint naming
            var frontDoorEndpoint = resources.OfType<FrontDoorEndpoint>().Single();
            frontDoorEndpoint.Name = BicepFunction.Take(BicepFunction.Interpolate($"frontdoor-endp-{uniqueStr}"), 50);

            // Configure origin group
            var originGroup = resources.OfType<FrontDoorOriginGroup>().Single();
            originGroup.Name = BicepFunction.Take(BicepFunction.Interpolate($"appservice-origin-group-{uniqueStr}"), 50);

            // Configure origin
            var origin = resources.OfType<FrontDoorOrigin>().Single();
            origin.Name = BicepFunction.Take(BicepFunction.Interpolate($"appservice-origin-{uniqueStr}"), 50);
            origin.Weight = 1000;
            origin.EnforceCertificateNameCheck = true;

            // Configure route with caching
            var route = resources.OfType<FrontDoorRoute>().Single();
            route.Name = BicepFunction.Take(BicepFunction.Interpolate($"default-route-{uniqueStr}"), 50);
            route.CacheConfiguration = new FrontDoorRouteCacheConfiguration
            {
                CompressionSettings = new RouteCacheCompressionSettings
                {
                    IsCompressionEnabled = true,
                    ContentTypesToCompress =
                    {
                        "text/plain",
                        "text/html",
                        "text/css",
                        "application/javascript",
                        "application/json",
                        "image/svg+xml"
                    }
                },
                QueryStringCachingBehavior = FrontDoorQueryStringCachingBehavior.IgnoreQueryString
            };

            // WAF Policy for DDoS compliance
            var wafPolicy = new FrontDoorWebApplicationFirewallPolicy("wafPolicy")
            {
                Name = BicepFunction.Take(
                    BicepFunction.Interpolate($"frontdoorwafDDoS{uniqueStr}"),
                    128),
                Location = new Azure.Core.AzureLocation("Global"),
                SkuName = FrontDoorSkuName.PremiumAzureFrontDoor,
                PolicySettings = new FrontDoorWebApplicationFirewallPolicySettings
                {
                    EnabledState = Azure.Provisioning.FrontDoor.PolicyEnabledState.Enabled,
                    Mode = FrontDoorWebApplicationFirewallPolicyMode.Detection,
                    CustomBlockResponseStatusCode = 403,
                    RequestBodyCheck = PolicyRequestBodyCheck.Enabled,
                    JavascriptChallengeExpirationInMinutes = 30
                },
                Rules =
                {
                    new WebApplicationCustomRule
                    {
                        Name = "GlobalRateLimitRule",
                        EnabledState = Azure.Provisioning.FrontDoor.CustomRuleEnabledState.Enabled,
                        Priority = 100,
                        RuleType = WebApplicationRuleType.RateLimitRule,
                        RateLimitDurationInMinutes = 5,
                        RateLimitThreshold = 500,
                        Action = RuleMatchActionType.Block,
                        MatchConditions =
                        {
                            new WebApplicationRuleMatchCondition
                            {
                                MatchVariable = WebApplicationRuleMatchVariable.RequestUri,
                                Operator = WebApplicationRuleMatchOperator.Contains,
                                IsNegateCondition = false,
                                MatchValue = { "/" }
                            }
                        }
                    }
                },
                ManagedRuleSets =
                {
                    new ManagedRuleSet
                    {
                        RuleSetType = "Microsoft_BotManagerRuleSet",
                        RuleSetVersion = "1.1"
                    }
                }
            };
            infra.Add(wafPolicy);

            // Security policy to associate WAF with Front Door endpoint
            var securityPolicy = new FrontDoorSecurityPolicy("securityPolicy")
            {
                Parent = profile,
                Name = BicepFunction.Take(
                    BicepFunction.Interpolate($"frontdoor-AppDDoS{uniqueStr}"),
                    260),
                Properties = new SecurityPolicyWebApplicationFirewall
                {
                    WafPolicyId = wafPolicy.Id,
                    Associations =
                    {
                        new SecurityPolicyWebApplicationFirewallAssociation
                        {
                            Domains = { new FrontDoorActivatedResourceInfo { Id = frontDoorEndpoint.Id } },
                            PatternsToMatch = { "/*" }
                        }
                    }
                }
            };
            infra.Add(securityPolicy);
        });
}

builder.Build().Run();
