using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
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
builder.Services.AddScoped<IPushNotificationService, PushNotificationService>();
builder.Services.AddScoped<IPinService, PinService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHostedService<DeadlineReminderService>();
builder.Services.AddHostedService<NoticeBinService>();

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
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!)),
            // Required for the SecurityStamp check below to have something
            // to read — ClaimsPrincipal needs the custom claim preserved.
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

builder.Services.AddAuthorization();

// --- CORS ---
// Restricted to the real client origins instead of a wildcard. Note this
// is browser-enforced defense-in-depth, not a security boundary on its
// own — a non-browser client (curl, a script) never sends or is bound by
// an Origin header at all, CORS is purely about what a *browser* running
// on someone else's page is allowed to read. The extension's requests
// come from a content script, which Chrome treats as the host page's own
// origin for CORS — that's why the portal origin is on this list.
//
// Cors:AllowedOrigins is a comma-separated list, so a staging deploy can
// point at its own PWA with a single environment variable
// (Cors__AllowedOrigins). In Development, any localhost origin is also
// allowed, for the local PWA dev server and the mock portal page.
var allowedOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var allowLocalhostOrigins = builder.Environment.IsDevelopment();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Extension", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
                allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase) ||
                (allowLocalhostOrigins && Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback))
            .AllowAnyHeader()
            .AllowAnyMethod()
            // Lets the clients see when their device unlock has lapsed.
            .WithExposedHeaders(PinService.DeviceTokenStatusHeader);
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

// Limits are per IP address, and a whole campus Wi-Fi (or a mobile
// network's carrier-grade NAT) can reach the server from one address:
// a notification tapped by a thousand students on campus within a minute
// is a thousand sign-ins from one address. So these only stop a single
// runaway client, not people. Guessing a PIN is stopped by the
// per-account lockout in PinService (and the pin-check limit below);
// activation codes are long random secrets, too long to guess.
builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 6000,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    options.RejectionStatusCode = 429;

    // A tighter, separate bucket specifically for /login — this is the
    // endpoint that grants access at all, including the activation-code
    // checks that can escalate to Publisher/Admin, so it deserves its own
    // stricter limit rather than sharing the generous general-purpose one.
    options.AddPolicy("login", context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 3000,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Every endpoint that checks a PIN (notice create/edit/delete and all
    // Admin actions) shares this bucket — a
    // 4-6 digit PIN has low enough entropy that even the general 60/min
    // limit isn't tight enough to meaningfully slow down a brute-force
    // attempt on its own. This doesn't fully solve that on its own either
    // (worth knowing honestly), but it meaningfully raises the cost of
    // trying, on top of the general limit, without throttling a real
    // Publisher's actual (infrequent) use of these endpoints at all.
    options.AddPolicy("pin-check", context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// --- Fail closed on placeholder secrets in Production ---
// If Jwt:Key or AdminActivationSecret are missing, empty, or still the
// literal placeholder text checked into the public repo, the app refuses
// to start at all rather than silently serving traffic with a
// publicly-known secret. A misconfigured deploy should be loud and down,
// not quiet and compromised.
if (builder.Environment.IsProduction())
{
    var jwtKey = jwtSettings["Key"];
    if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.StartsWith("REPLACE_") || jwtKey.Length < 32)
    {
        throw new InvalidOperationException(
            "Refusing to start: Jwt__Key is missing, still the placeholder value, or shorter than 32 characters. " +
            "Set a real random secret via the Jwt__Key environment variable.");
    }

    var adminSecret = builder.Configuration["AdminActivationSecret"];
    if (string.IsNullOrWhiteSpace(adminSecret) || adminSecret.StartsWith("REPLACE_"))
    {
        throw new InvalidOperationException(
            "Refusing to start: AdminActivationSecret is missing or still the placeholder value. " +
            "Set a real random secret via the AdminActivationSecret environment variable.");
    }
}

var app = builder.Build();

// --- Apply any pending EF Core migrations automatically on startup ---
// Previously this was a manual "remember to run dotnet ef database
// update" step — easy to forget on a fresh deploy or after restoring a
// database, and the app would otherwise start successfully and then
// throw errors the moment it queried a table/column that doesn't exist
// yet. Safe here specifically because this runs as a single instance;
// this pattern needs additional locking if ever scaled to multiple
// concurrent instances applying migrations at once.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // The fixed category list (see CategoryCatalog): created on a fresh
    // database, and older free-form categories folded into it.
    await CategoryCatalog.EnsureAsync(db, app.Logger);

    // Sample content for local runs and staging only. Off unless
    // SeedDemoData=true, and a no-op on any database that already has
    // users, so it can never add demo rows to real data.
    if (app.Configuration.GetValue<bool>("SeedDemoData"))
    {
        await DemoDataSeeder.SeedIfEmptyAsync(db, posterBaseUrl: app.Configuration["DemoData:PosterBaseUrl"]);
    }
}

// --- Forwarded headers, so rate limiting and logging see the real client
// IP instead of Railway's own proxy IP. Must run before anything that
// reads Connection.RemoteIpAddress (i.e. before the rate limiter, and
// as close to the very start of the pipeline as possible). KnownNetworks
// / KnownProxies are cleared because Railway's proxy IP isn't a fixed,
// publishable range — this app is only ever reachable through Railway's
// own edge, not directly, which is what makes trusting the forwarded
// header safe here. ---
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

app.UseCors("Extension");

app.UseResponseCompression();
app.UseRateLimiter();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        // Exception messages can name tables, columns or connection
        // details, so only development shows them; everyone else gets a
        // generic message (the full error still goes to the logs).
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        var message = app.Environment.IsDevelopment() && feature?.Error is not null
            ? feature.Error.Message
            : "Something went wrong. Please try again.";
        await context.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new { error = message }));
    });
});

// The API explorer lists every endpoint and request shape — handy while
// developing, but nothing a public server needs to advertise.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();

// Enforces the security stamp for #10: a token that claims Publisher or
// Admin only continues to work if its embedded stamp still matches the
// user's CURRENT database value. Any role change rotates that value
// immediately (see UsersController), so a demoted user's existing token
// is rejected on their very next request — not up to 7 days later, which
// is how long the token itself remains otherwise valid for. Runs only
// for privileged-role tokens; ordinary Student requests skip the DB
// lookup entirely, so this adds no cost to the common case.
app.Use(async (context, next) =>
{
    var roleClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
    if (roleClaim is "Publisher" or "Admin")
    {
        // ASP.NET Core's JWT validation automatically remaps the standard
        // "sub" claim to ClaimTypes.NameIdentifier by the time it reaches
        // here — checking only JwtRegisteredClaimNames.Sub directly finds
        // nothing and rejects every privileged request unconditionally.
        // Every controller's CurrentUserId already handles this correctly
        // (checks NameIdentifier first, falls back to raw "sub"); this
        // needs the exact same fallback.
        var subClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? context.User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        var stampClaim = context.User.FindFirst("stamp")?.Value;

        if (subClaim is null || !int.TryParse(subClaim, out var userId))
        {
            context.Response.StatusCode = 401;
            return;
        }

        var db = context.RequestServices.GetRequiredService<AppDbContext>();
        var currentStamp = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.SecurityStamp)
            .FirstOrDefaultAsync();

        // A null currentStamp (e.g. an account that existed before this
        // check was added and hasn't logged in since) fails closed —
        // treated the same as a mismatch, never as an automatic pass.
        if (currentStamp is null || currentStamp != stampClaim)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Your session has expired. Please reload the page.\"}");
            return;
        }
    }

    await next();
});

app.UseAuthorization();
app.MapControllers();

// For uptime checks: 200 when the API is up and can reach the database,
// 503 when the database is unreachable. Unauthenticated and says nothing
// beyond "ok"/"unhealthy".
app.MapGet("/health", async (AppDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { status = "ok" })
        : Results.Json(new { status = "unhealthy" }, statusCode: StatusCodes.Status503ServiceUnavailable))
    .DisableRateLimiting();

app.Run();

// Exposes the compiler-generated Program class so the test project's
// WebApplicationFactory<Program> can boot this exact pipeline in-memory.
public partial class Program { }
