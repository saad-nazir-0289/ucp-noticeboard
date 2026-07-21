using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddActivationCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PendingActivationCode",
                table: "Users",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PendingActivationCode", table: "Users");
        }
    }
}
