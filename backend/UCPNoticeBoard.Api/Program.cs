using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// --- Railway (and most PaaS hosts) assign a dynamic port via $PORT and
// expect the app to bind to 0.0.0.0. Locally, PORT is unset, so this falls
// back to whatever's in launchSettings.json / appsettings.json as usual. ---
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

// --- Database ---
// Built from individual PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
// variables (Railway's standard names for a linked Postgres) instead of one
// hand-typed combined connection string — a single mistyped or malformed
// combined string is a common, hard-to-spot source of startup crashes.
// Npgsql's own builder assembles and escapes it correctly. Falls back to
// ConnectionStrings:DefaultConnection from appsettings.json for local dev,
// where PGHOST etc. won't be set.
var pgHost = Environment.GetEnvironmentVariable("PGHOST");
string connectionString;
if (!string.IsNullOrWhiteSpace(pgHost))
{
    var pgPort = int.TryParse(Environment.GetEnvironmentVariable("PGPORT"), out var parsedPort)
        ? parsedPort
        : 5432;

    var csb = new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = pgHost,
        Port = pgPort,
        Database = Environment.GetEnvironmentVariable("PGDATABASE"),
        Username = Environment.GetEnvironmentVariable("PGUSER"),
        Password = Environment.GetEnvironmentVariable("PGPASSWORD"),
    };
    connectionString = csb.ConnectionString;
}
else
{
    connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("No database connection configured.");
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

// --- Services ---
builder.Services.AddMemoryCache();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<INoticeQueryService, NoticeQueryService>();

// --- Auth ---
var jwtSettings = builder.Configuration.GetSection("Jwt");
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!))
        };
    });

builder.Services.AddAuthorization();

// --- CORS: the extension's content script runs in the page origin, so we
// allow the UCP portal origin plus the extension's own runtime origin. ---
builder.Services.AddCors(options =>
{
    options.AddPolicy("Extension", policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true) // extension content scripts don't send a browser-restricted Origin
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Compresses JSON responses (notice lists, especially) — meaningfully
// faster over slower/mobile connections, essentially free to enable.
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

// A generous global limit — this isn't meant to throttle normal usage
// (a real page load is only a handful of requests), it's a safety net
// against a broken client stuck in a retry loop, or abuse, either of
// which could otherwise hammer the database directly. Legitimate traffic,
// even a genuine burst of many different students at once, should never
// come close to this per-client limit.
builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    options.RejectionStatusCode = 429;
});

var app = builder.Build();

// CORS goes FIRST, before anything else — including the exception handler
// below. This guarantees every response, even a crash/error response, gets
// the CORS header attached. Without this ordering, a server-side crash can
// show up in the browser as a confusing "blocked by CORS policy" message
// instead of the real error, because the crashed response never got as far
// as the CORS middleware.
app.UseCors("Extension");

app.UseResponseCompression();
app.UseRateLimiter();

// Turns any unhandled exception into a readable JSON error instead of a
// raw connection failure. This is what lets you actually SEE what broke
// (open the failed request in Chrome's Network tab → Response) instead of
// just seeing "500" with no explanation.
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        var message = feature?.Error?.Message ?? "An unexpected error occurred.";
        await context.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new { error = message }));
    });
});

// Swagger stays on in every environment on purpose (not just Development).
// It's just API documentation — nothing sensitive — and having it always
// available is what makes it possible to quickly check "did my deployment
// actually work?" by visiting /swagger.
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
