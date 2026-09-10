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
builder.Services.AddHostedService<DeadlineReminderService>();

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
// Restricted to the two real client origins instead of a wildcard. Note
// this is browser-enforced defense-in-depth, not a security boundary on
// its own — a non-browser client (curl, a script) never sends or is
// bound by an Origin header at all, CORS is purely about what a *browser*
// running on someone else's page is allowed to read. The extension's own
// requests aren't blocked by this either way, since Manifest V3
// host_permissions already exempt it from CORS enforcement on the
// requesting side — this specifically stops an unrelated website's JS
// from successfully reading responses using a visiting browser.
builder.Services.AddCors(options =>
{
    options.AddPolicy("Extension", policy =>
    {
        policy
            .WithOrigins(
                "https://horizon.ucp.edu.pk",
                "https://ucp-noticeboard.msndev.workers.dev"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
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
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Notice create/edit/delete is where a PIN actually gets checked — a
    // 4-6 digit PIN has low enough entropy that even the general 60/min
    // limit isn't tight enough to meaningfully slow down a brute-force
    // attempt on its own. This doesn't fully solve that on its own either
    // (worth knowing honestly), but it meaningfully raises the cost of
    // trying, on top of the general limit, without throttling a real
    // Publisher's actual (infrequent) use of these endpoints at all.
    options.AddPolicy("notice-mutation", context =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
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
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        var message = feature?.Error?.Message ?? "An unexpected error occurred.";
        await context.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new { error = message }));
    });
});

app.UseSwagger();
app.UseSwaggerUI();

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
            await context.Response.WriteAsync("{\"error\":\"Session no longer valid — please reload.\"}");
            return;
        }
    }

    await next();
});

app.UseAuthorization();
app.MapControllers();

app.Run();
