using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Npgsql;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Tests.Infrastructure;

/// <summary>
/// Boots the real API pipeline in-memory against a throwaway PostgreSQL
/// database. Each test class gets its own factory (via IClassFixture), so
/// its own database — migrated on startup by Program.cs exactly as in
/// production, and dropped again once the class finishes.
///
/// The server is taken from UCP_TEST_POSTGRES (an Npgsql connection string
/// without a Database), defaulting to the local postgres/postgres instance
/// the session-start hook provisions.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminActivationSecret = "test-admin-activation-secret";
    public const string AdminPin = "4321";

    private const string DefaultServer = "Host=localhost;Port=5432;Username=postgres;Password=postgres";

    private readonly string _serverConnectionString;
    private readonly string _databaseName = $"ucp_test_{Guid.NewGuid():N}";
    private readonly SemaphoreSlim _adminLock = new(1, 1);
    private LoginResponse? _admin;

    public FakePushNotificationService Push { get; } = new();

    public ApiFactory()
    {
        _serverConnectionString = Environment.GetEnvironmentVariable("UCP_TEST_POSTGRES") ?? DefaultServer;

        // Program.cs prefers PGHOST/PGUSER/... over configuration whenever
        // PGHOST is set (that's how Railway injects its database). Clear it
        // so a CI runner that happens to export PGHOST can't point the
        // tests at a real database.
        Environment.SetEnvironmentVariable("PGHOST", null);
    }

    public string ConnectionString =>
        new NpgsqlConnectionStringBuilder(_serverConnectionString) { Database = _databaseName }.ConnectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:DefaultConnection", ConnectionString);
        builder.UseSetting("AdminActivationSecret", AdminActivationSecret);
        builder.UseSetting("Jwt:Key", "test-only-jwt-signing-key-that-is-long-enough-0123456789");
        builder.UseSetting("Logging:LogLevel:Default", "Warning");

        builder.ConfigureTestServices(services =>
        {
            // Timer-driven background work makes tests nondeterministic.
            services.RemoveAll<IHostedService>();

            services.RemoveAll<IPushNotificationService>();
            services.AddSingleton<IPushNotificationService>(Push);
        });
    }

    /// <summary>
    /// An anonymous client. Every request gets a unique X-Forwarded-For
    /// address so the per-IP rate limits (which Program.cs keys on the
    /// forwarded client IP) never trip across unrelated tests.
    /// </summary>
    public HttpClient CreateApiClient(string? token = null)
    {
        var client = CreateDefaultClient(new UniqueClientIpHandler());
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    public async Task<LoginResponse> LoginAsync(string rollNumber, string name = "Test User", string? activationCode = null)
    {
        using var client = CreateApiClient();
        var response = await client.PostAsJsonAsync("/login", new LoginRequest(rollNumber, name, activationCode));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<LoginResponse>())!;
    }

    public async Task<LoginResponse> LoginStudentAsync() => await LoginAsync(RollNumbers.Next());

    /// <summary>
    /// The one Admin for this database, claimed on first use through the
    /// AdminActivationSecret bootstrap path. Its PIN is <see cref="AdminPin"/>.
    /// </summary>
    public async Task<LoginResponse> GetAdminAsync()
    {
        await _adminLock.WaitAsync();
        try
        {
            if (_admin is null)
            {
                var admin = await LoginAsync(RollNumbers.Next(), "Test Admin", AdminActivationSecret);
                Assert.Equal("Admin", admin.Role);
                _admin = admin;
            }
            return _admin;
        }
        finally
        {
            _adminLock.Release();
        }
    }

    /// <summary>A fresh Publisher, added by the Admin, logged in with a current token.</summary>
    public async Task<LoginResponse> CreatePublisherAsync()
    {
        var admin = await GetAdminAsync();
        var rollNumber = RollNumbers.Next();

        using var adminClient = CreateApiClient(admin.Token);
        var response = await adminClient.PostAsJsonAsync("/users", new AddUserRequest(rollNumber, "Test Publisher", AdminPin));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var publisher = await LoginAsync(rollNumber);
        Assert.Equal("Publisher", publisher.Role);
        return publisher;
    }

    public async Task InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(_serverConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{_databaseName}\"", connection);
        await command.ExecuteNonQueryAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();

        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(_serverConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync();
    }

    private sealed class UniqueClientIpHandler : DelegatingHandler
    {
        private static int _counter;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var n = Interlocked.Increment(ref _counter);
            request.Headers.Add("X-Forwarded-For", $"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}");
            return base.SendAsync(request, cancellationToken);
        }
    }
}
