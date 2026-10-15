using System.Net;
using Microsoft.AspNetCore.Hosting;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>What a production server does and doesn't expose.</summary>
public class HardeningTests : IClassFixture<HardeningTests.ProductionApiFactory>, IClassFixture<ApiFactory>
{
    public class ProductionApiFactory : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseEnvironment("Production");
        }
    }

    private readonly ProductionApiFactory _production;
    private readonly ApiFactory _development;

    public HardeningTests(ProductionApiFactory production, ApiFactory development)
    {
        _production = production;
        _development = development;
    }

    [Fact]
    public async Task Swagger_IsOffInProduction()
    {
        using var client = _production.CreateApiClient();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/swagger/v1/swagger.json")).StatusCode);
    }

    [Fact]
    public async Task Swagger_IsOnInDevelopment()
    {
        using var client = _development.CreateApiClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/swagger/v1/swagger.json")).StatusCode);
    }

    [Fact]
    public async Task Health_ReportsOkWhenTheDatabaseIsReachable()
    {
        using var client = _production.CreateApiClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"ok\"", await response.Content.ReadAsStringAsync());
    }
}
