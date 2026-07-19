# Multi-stage build: compile with the full SDK, run on the small ASP.NET runtime image.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY UCPNoticeBoard.Api/UCPNoticeBoard.Api.csproj UCPNoticeBoard.Api/
RUN dotnet restore UCPNoticeBoard.Api/UCPNoticeBoard.Api.csproj

COPY UCPNoticeBoard.Api/ UCPNoticeBoard.Api/
RUN dotnet publish UCPNoticeBoard.Api/UCPNoticeBoard.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "UCPNoticeBoard.Api.dll"]
