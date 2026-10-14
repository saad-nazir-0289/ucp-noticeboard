using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class UserListTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public UserListTests(ApiFactory api) => _api = api;

    private async Task<HttpClient> AdminClientAsync()
    {
        var admin = await _api.GetAdminAsync();
        var client = _api.CreateApiClient(admin.Token);
        client.DefaultRequestHeaders.Add("X-Admin-Pin", ApiFactory.AdminPin);
        // First use sets the Admin's PIN.
        await client.PostAsJsonAsync("/users", new AddUserRequest(RollNumbers.Next(), "Setup", ApiFactory.AdminPin));
        return client;
    }

    /// <summary>Adds students straight to the database (fast — no PIN hashing involved).</summary>
    private async Task<List<string>> AddStudentsAsync(string namePrefix, int count)
    {
        using var scope = _api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rolls = Enumerable.Range(0, count).Select(_ => RollNumbers.Next()).ToList();
        db.Users.AddRange(rolls.Select((r, i) => new User { RollNumber = r, Name = $"{namePrefix} {i:D2}", Role = UserRole.Student }));
        await db.SaveChangesAsync();
        return rolls;
    }

    [Fact]
    public async Task Users_ArePagedWithATotal()
    {
        using var client = await AdminClientAsync();
        await AddStudentsAsync("Pager", 25);

        var first = await client.GetFromJsonAsync<PagedResult<UserDto>>("/users?search=Pager&pageSize=10");
        var third = await client.GetFromJsonAsync<PagedResult<UserDto>>("/users?search=Pager&pageSize=10&page=3");

        Assert.Equal(25, first!.Total);
        Assert.Equal(10, first.Items.Count);
        Assert.Equal("Pager 00", first.Items[0].Name);
        Assert.Equal(5, third!.Items.Count);
        Assert.Equal("Pager 24", third.Items[^1].Name);
    }

    [Fact]
    public async Task Search_MatchesPartOfARollNumber_CaseInsensitively()
    {
        using var client = await AdminClientAsync();
        var rolls = await AddStudentsAsync("Roll search", 3);
        var target = rolls[1];

        var result = await client.GetFromJsonAsync<PagedResult<UserDto>>($"/users?search={target[^6..].ToLowerInvariant()}");

        Assert.Contains(result!.Items, u => u.RollNumber == target);
        Assert.All(result.Items, u => Assert.Contains(target[^6..], u.RollNumber));
    }

    [Fact]
    public async Task Search_MatchesNames_AndTreatsWildcardsLiterally()
    {
        using var client = await AdminClientAsync();
        await AddStudentsAsync("Zubair Iqbal", 1);

        var byName = await client.GetFromJsonAsync<PagedResult<UserDto>>("/users?search=zubair");
        var wildcard = await client.GetFromJsonAsync<PagedResult<UserDto>>("/users?search=%25");

        Assert.Single(byName!.Items);
        Assert.Empty(wildcard!.Items); // "%" is a literal character, not "match everything"
    }

    [Fact]
    public async Task PageSize_IsCapped()
    {
        using var client = await AdminClientAsync();

        var result = await client.GetFromJsonAsync<PagedResult<UserDto>>("/users?pageSize=5000");

        Assert.Equal(100, result!.PageSize);
    }
}
