/*
 * SPDX-FileCopyrightText: 2021 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
  BadRequestException,
  Controller,
  Delete,
  Headers,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import {
  ClientError,
  MediaBackendError,
  NotInDBError,
  PermissionError,
} from '../../../errors/errors';
import { ConsoleLoggerService } from '../../../logger/console-logger.service';
import { MediaService } from '../../../media/media.service';
import { MulterFile } from '../../../media/multer-file.interface';
import { TokenAuthGuard } from '../../../auth/token-auth.guard';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MediaUploadUrlDto } from '../../../media/media-upload-url.dto';
import {
  forbiddenDescription,
  notFoundDescription,
  successfullyDeletedDescription,
  unauthorizedDescription,
} from '../../utils/descriptions';

@ApiTags('media')
@ApiSecurity('token')
@Controller('media')
export class MediaController {
  constructor(
    private readonly logger: ConsoleLoggerService,
    private mediaService: MediaService,
  ) {
    this.logger.setContext(MediaController.name);
  }

  @UseGuards(TokenAuthGuard)
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'The binary file to upload',
  })
  @ApiHeader({
    name: 'HedgeDoc-Note',
    description: 'ID or alias of the parent note',
  })
  @ApiCreatedResponse({
    description: 'The file was uploaded successfully',
    type: MediaUploadUrlDto,
  })
  @ApiUnauthorizedResponse({ description: unauthorizedDescription })
  @ApiForbiddenResponse({ description: forbiddenDescription })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(201)
  async uploadMedia(
    @Req() req: Request,
    @UploadedFile() file: MulterFile,
    @Headers('HedgeDoc-Note') noteId: string,
  ): Promise<MediaUploadUrlDto> {
    const username = req.user.userName;
    this.logger.debug(
      `Recieved filename '${file.originalname}' for note '${noteId}' from user '${username}'`,
      'uploadImage',
    );
    try {
      const url = await this.mediaService.saveFile(
        file.buffer,
        username,
        noteId,
      );
      return this.mediaService.toMediaUploadUrlDto(url);
    } catch (e) {
      if (e instanceof ClientError || e instanceof NotInDBError) {
        throw new BadRequestException(e.message);
      }
      if (e instanceof MediaBackendError) {
        throw new InternalServerErrorException(
          'There was an error in the media backend',
        );
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Delete(':filename')
  @HttpCode(204)
  @ApiNoContentResponse({ description: successfullyDeletedDescription })
  @ApiUnauthorizedResponse({ description: unauthorizedDescription })
  @ApiForbiddenResponse({ description: forbiddenDescription })
  @ApiNotFoundResponse({ description: notFoundDescription })
  async deleteMedia(
    @Req() req: Request,
    @Param('filename') filename: string,
  ): Promise<void> {
    const username = req.user.userName;
    try {
      await this.mediaService.deleteFileByFilename(filename, username);
    } catch (e) {
      if (e instanceof PermissionError) {
        throw new UnauthorizedException(e.message);
      }
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof MediaBackendError) {
        throw new InternalServerErrorException(
          'There was an error in the media backend',
        );
      }
      throw e;
    }
  }
}
