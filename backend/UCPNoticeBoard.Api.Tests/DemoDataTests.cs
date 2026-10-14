using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class DemoDataTests : IClassFixture<DemoDataTests.SeededApiFactory>
{
    public class SeededApiFactory : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("SeedDemoData", "true");
        }
    }

    private readonly SeededApiFactory _api;

    public DemoDataTests(SeededApiFactory api) => _api = api;

    [Theory]
    [InlineData(DemoDataSeeder.AdminRollNumber, "Admin")]
    [InlineData(DemoDataSeeder.ComputingSocietyRollNumber, "Publisher")]
    [InlineData(DemoDataSeeder.StudentAffairsRollNumber, "Publisher")]
    [InlineData(DemoDataSeeder.FirstStudentRollNumber, "Student")]
    public async Task DemoAccounts_HaveExpectedRoles(string rollNumber, string role)
    {
        var user = await _api.LoginAsync(rollNumber);

        Assert.Equal(role, user.Role);
    }

    [Fact]
    public async Task StudentFeed_ShowsOnlyActiveNotices_NewestFirst()
    {
        var student = await _api.LoginAsync(DemoDataSeeder.FirstStudentRollNumber);

        Assert.Equal(6, student.Notices.Count);
        Assert.Equal(student.Notices.OrderByDescending(n => n.CreatedAt).Select(n => n.Id), student.Notices.Select(n => n.Id));
        Assert.Equal(5, student.Categories.Count);
        // The first seeded student liked the most popular notices.
        Assert.Contains(student.Notices, n => n.LikedByMe && n.LikeCount == 4);
    }

    [Fact]
    public async Task ManagementView_AlsoShowsExpiredNotices()
    {
        var publisher = await _api.LoginAsync(DemoDataSeeder.StudentAffairsRollNumber);
        using var client = _api.CreateApiClient(publisher.Token);

        var all = await client.GetFromJsonAsync<List<NoticeDto>>("/notices?includeExpired=true");

        Assert.Equal(8, all!.Count);
    }

    [Fact]
    public async Task DemoPin_WorksForPublishing()
    {
        var publisher = await _api.LoginAsync(DemoDataSeeder.ComputingSocietyRollNumber);
        using var client = _api.CreateApiClient(publisher.Token);

        var response = await client.PostAsJsonAsync("/notices",
            new CreateNoticeRequest("Demo post", "Body", null, null, null, null, DemoDataSeeder.DemoPin));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Seeder_IsANoOpOnADatabaseWithUsers()
    {
        using var scope = _api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var usersBefore = db.Users.Count();

        var seeded = await DemoDataSeeder.SeedIfEmptyAsync(db);

        Assert.False(seeded);
        Assert.Equal(usersBefore, db.Users.Count());
    }
}

public class NoDemoDataByDefaultTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public NoDemoDataByDefaultTests(ApiFactory api) => _api = api;

    [Fact]
    public async Task WithoutTheFlag_DatabaseStartsEmpty()
    {
        var student = await _api.LoginStudentAsync();

        Assert.Empty(student.Notices);
        Assert.Empty(student.Categories);
    }
}
