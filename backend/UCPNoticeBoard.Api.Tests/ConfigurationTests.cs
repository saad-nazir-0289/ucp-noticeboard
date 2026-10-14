using System.Net;
using Microsoft.AspNetCore.Hosting;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>With no overrides, the API must behave exactly like production.</summary>
public class DefaultConfigurationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public DefaultConfigurationTests(ApiFactory api) => _api = api;

    [Theory]
    [InlineData("https://horizon.ucp.edu.pk")]
    [InlineData("https://ucp-noticeboard.msndev.workers.dev")]
    [InlineData("http://localhost:5173")] // tests run as Development
    public async Task Cors_AllowsProductionAndLocalOrigins(string origin)
    {
        Assert.Equal(origin, await CorsHelpers.AllowedOriginFor(_api, origin));
    }

    [Theory]
    [InlineData("https://evil.example.com")]
    [InlineData("https://horizon.ucp.edu.pk.evil.example.com")]
    public async Task Cors_RejectsOtherOrigins(string origin)
    {
        Assert.Null(await CorsHelpers.AllowedOriginFor(_api, origin));
    }

    [Fact]
    public async Task ShareLink_RedirectsToProductionPwa()
    {
        using var client = _api.CreateApiClient();

        var html = await client.GetStringAsync("/share/notice/999999");

        Assert.Contains("https://ucp-noticeboard.msndev.workers.dev/?notice=999999", html);
    }
}

/// <summary>A staging deploy overrides both settings through configuration.</summary>
public class StagingConfigurationTests : IClassFixture<StagingConfigurationTests.StagingApiFactory>
{
    public class StagingApiFactory : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Cors:AllowedOrigins", "https://horizon.ucp.edu.pk, https://staging-pwa.example.com");
            builder.UseSetting("Pwa:BaseUrl", "https://staging-pwa.example.com/");
        }
    }

    private readonly StagingApiFactory _api;

    public StagingConfigurationTests(StagingApiFactory api) => _api = api;

    [Fact]
    public async Task Cors_UsesConfiguredOrigins()
    {
        Assert.Equal("https://staging-pwa.example.com",
            await CorsHelpers.AllowedOriginFor(_api, "https://staging-pwa.example.com"));
        Assert.Null(await CorsHelpers.AllowedOriginFor(_api, "https://ucp-noticeboard.msndev.workers.dev"));
    }

    [Fact]
    public async Task ShareLink_RedirectsToConfiguredPwa()
    {
        using var client = _api.CreateApiClient();

        var html = await client.GetStringAsync("/share/notice/999999");

        Assert.Contains("https://staging-pwa.example.com/?notice=999999", html);
    }
}

internal static class CorsHelpers
{
    /// <summary>Sends a CORS preflight and returns the echoed allowed origin, or null if refused.</summary>
    public static async Task<string?> AllowedOriginFor(ApiFactory api, string origin)
    {
        using var client = api.CreateApiClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/login");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await client.SendAsync(request);

        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        return response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values)
            ? values.Single()
            : null;
    }
}
